-- ============================================================
-- General rate limiting
--
-- Sign-in already has its own lockout (0021). This covers the rest of the
-- endpoints a stranger can hit without an account:
--   * password-reset requests  (each one sends an email -> spam / email bombing)
--   * Dorm ID lookups          (an 8-character code that can otherwise be guessed
--                               without limit)
--   * account sign-ups         (automated account creation)
--
-- A simple fixed window per key: at most p_max hits in any p_window_seconds.
-- Keys are built by the app (e.g. 'reset:email:a@b.com', 'lookup:ip:1.2.3.4').
--
-- Atomic (row lock), so parallel requests can't all slip under the limit, and
-- server-only like the lockout functions: the public anon key must not be able
-- to call it (or read the table).
-- ============================================================

create table if not exists public.rate_limits (
  key text primary key,
  hits integer not null default 0,
  window_started_at timestamptz not null default now()
);

create index if not exists rate_limits_window_started_at_idx
  on public.rate_limits (window_started_at);

alter table public.rate_limits enable row level security;

create or replace function public.rate_limit_hit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rate_limits;
  v_window interval := make_interval(secs => greatest(p_window_seconds, 1));
  v_hits integer;
begin
  -- Housekeeping so the table can't grow forever.
  if random() < 0.02 then
    delete from public.rate_limits
    where window_started_at < now() - interval '1 day';
  end if;

  insert into public.rate_limits (key) values (left(p_key, 200))
  on conflict (key) do nothing;

  -- Serialize concurrent hits on the same key.
  select * into r from public.rate_limits where key = left(p_key, 200) for update;

  -- The previous window is over: start a fresh one with this hit.
  if r.window_started_at <= now() - v_window then
    update public.rate_limits
      set hits = 1, window_started_at = now()
      where key = left(p_key, 200);
    return query select true, 0;
    return;
  end if;

  v_hits := r.hits + 1;
  update public.rate_limits set hits = v_hits where key = left(p_key, 200);

  if v_hits > p_max then
    return query select
      false,
      greatest(1, ceil(extract(epoch from (r.window_started_at + v_window - now())))::integer);
    return;
  end if;

  return query select true, 0;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer)
  to service_role;
