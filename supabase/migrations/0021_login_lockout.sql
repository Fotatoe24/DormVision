-- ============================================================
-- Sign-in lockout: 3 wrong tries -> locked for 5 minutes
--
-- Guards login() in lib/actions.ts against password guessing.
--
-- WHY THE DATABASE: the app runs as serverless functions, so any counter
-- kept in memory would be reset (or split across instances) all the time.
-- The state has to live in Postgres.
--
-- KEYED BY EMAIL, NOT BY USER: unknown emails are counted and locked
-- exactly like real ones, so the lockout message can never be used to find
-- out which emails have accounts. (The trade-off, inherent to any account
-- lockout: someone can deliberately lock a known email for 5 minutes.)
--
-- ATOMIC: the attempt is counted BEFORE the password is checked, under a
-- row lock, so a burst of parallel guesses can't all slip past the limit --
-- at most 3 password checks happen per window.
--
-- ACCESS: these are SECURITY DEFINER functions, which Supabase exposes at
-- /rest/v1/rpc/* to anyone holding the public anon key unless EXECUTE is
-- revoked. They are revoked below: only the server (service role) may call
-- them, which is how the app always reaches the database.
-- ============================================================

create table if not exists public.login_attempts (
  email text primary key,
  -- attempts started in the current window (a success deletes the row)
  attempts integer not null default 0,
  locked_until timestamptz,
  last_attempt_at timestamptz not null default now()
);

create index if not exists login_attempts_last_attempt_at_idx
  on public.login_attempts (last_attempt_at);

-- RLS on with no policies = no access for anon/authenticated at all.
alter table public.login_attempts enable row level security;

-- ---------- 1. Start an attempt (call BEFORE checking the password) ----------
-- Returns locked = true (and how long to wait) if the email is locked or this
-- attempt is over the limit; otherwise it counts the attempt and lets it run.
create or replace function public.login_attempt_begin(p_email text)
returns table (locked boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.login_attempts;
begin
  -- Housekeeping so a flood of random emails can't grow the table forever.
  if random() < 0.02 then
    delete from public.login_attempts
    where last_attempt_at < now() - interval '1 day';
  end if;

  insert into public.login_attempts (email) values (p_email)
  on conflict (email) do nothing;

  -- Serialize concurrent attempts for the same email.
  select * into r from public.login_attempts where email = p_email for update;

  if r.locked_until is not null and r.locked_until > now() then
    return query select true, ceil(extract(epoch from (r.locked_until - now())))::integer;
    return;
  end if;

  -- A finished lockout, or failures older than 15 minutes, start fresh.
  if r.locked_until is not null or r.last_attempt_at < now() - interval '15 minutes' then
    r.attempts := 0;
    r.locked_until := null;
  end if;

  r.attempts := r.attempts + 1;

  -- A 4th attempt means parallel requests got past the 3rd failure before it
  -- registered; lock now rather than let them through.
  if r.attempts > 3 then
    update public.login_attempts
      set attempts = r.attempts,
          locked_until = now() + interval '5 minutes',
          last_attempt_at = now()
      where email = p_email;
    return query select true, 300;
    return;
  end if;

  update public.login_attempts
    set attempts = r.attempts,
        locked_until = null,
        last_attempt_at = now()
    where email = p_email;

  return query select false, 0;
end;
$$;

-- ---------- 2. The password was wrong ----------
-- Locks on the 3rd failure. Returns how many tries are left otherwise.
create or replace function public.login_attempt_failed(p_email text)
returns table (locked boolean, retry_after_seconds integer, attempts_left integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.login_attempts;
begin
  select * into r from public.login_attempts where email = p_email for update;

  if not found then
    return query select false, 0, 3;
    return;
  end if;

  if r.attempts >= 3 then
    -- Don't extend a lock that is already running.
    if r.locked_until is null or r.locked_until <= now() then
      update public.login_attempts
        set locked_until = now() + interval '5 minutes'
        where email = p_email;
      return query select true, 300, 0;
    else
      return query select true, ceil(extract(epoch from (r.locked_until - now())))::integer, 0;
    end if;
    return;
  end if;

  return query select false, 0, greatest(0, 3 - r.attempts);
end;
$$;

-- ---------- 3. Successful sign-in: forget the failures ----------
create or replace function public.login_attempt_clear(p_email text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.login_attempts where email = p_email;
$$;

-- ---------- Server-only ----------
revoke all on function public.login_attempt_begin(text) from public, anon, authenticated;
revoke all on function public.login_attempt_failed(text) from public, anon, authenticated;
revoke all on function public.login_attempt_clear(text) from public, anon, authenticated;

grant execute on function public.login_attempt_begin(text) to service_role;
grant execute on function public.login_attempt_failed(text) to service_role;
grant execute on function public.login_attempt_clear(text) to service_role;
