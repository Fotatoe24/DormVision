-- ============================================================
-- Platform administration: lifecycle fields, settings, audit log
--
-- Run 0027 (which adds the `platform_admin` role) before this.
--
-- Adds what a platform admin needs to operate DormVision:
--   1. dorm lifecycle     approved_at / suspended_at on dormitories
--   2. account lifecycle  disabled_at on users
--   3. platform_settings  one row; today just "require approval for new owners"
--   4. audit_log          an append-only record of everything an admin does
--
-- Everything here is server-side only. The app reaches the database through the
-- service-role client; RLS is on for every new table with no policies, so the
-- public (anon) key can read and write none of it.
-- ============================================================

-- ---------- 1. Dorm lifecycle ----------
--
-- A dorm is:  pending   approved_at IS NULL            (waiting for approval)
--             suspended suspended_at IS NOT NULL       (blocked by the admin)
--             active    otherwise
-- New dorms default to approved (now()); the app clears approved_at on a new
-- sign-up only when the platform setting "require approval" is on.
--
-- Guarded so it runs once: the backfill marks EXISTING dorms approved, and
-- running it again later must not approve a dorm that is genuinely pending.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dormitories'
      and column_name = 'approved_at'
  ) then
    alter table public.dormitories
      add column approved_at timestamptz default now();

    -- every dorm that exists today was created before approval existed
    update public.dormitories set approved_at = created_at;
  end if;
end $$;

alter table public.dormitories
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text;

-- ---------- 2. Account lifecycle ----------

alter table public.users
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_reason text;

-- A platform admin runs the platform, not a dorm.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_platform_admin_has_no_dorm'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_platform_admin_has_no_dorm
      check (role <> 'platform_admin' or dorm_id is null);
  end if;
end $$;

-- ---------- 3. Platform settings (exactly one row) ----------

create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  -- when true, a new owner's dorm stays 'pending' until an admin approves it
  require_owner_approval boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

insert into public.platform_settings (id) values (true) on conflict do nothing;

alter table public.platform_settings enable row level security;

-- ---------- 4. Audit log (append-only) ----------
--
-- actor_id is deliberately NOT a foreign key, and the actor's email and the
-- target's label are copied in as text: the record has to stay true and readable
-- after an account is renamed or deleted.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid,
  actor_email text not null,
  action text not null,            -- e.g. 'dorm.suspend', 'account.disable'
  target_type text,                -- 'dormitory' | 'user' | 'platform_settings'
  target_id text,
  target_label text,               -- the dorm name / account email at the time
  reason text,
  details jsonb not null default '{}'::jsonb,
  ip text
);

create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at desc);
create index if not exists audit_log_action_idx
  on public.audit_log (action);

alter table public.audit_log enable row level security;

-- Nothing may change or remove a row once written. A trigger rather than only a
-- REVOKE, because the app's server key (service_role) bypasses RLS and would
-- otherwise be able to rewrite history; triggers fire for every role.
create or replace function public.audit_log_block_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'audit_log is append-only: % is not allowed', tg_op;
end;
$$;

drop trigger if exists audit_log_no_update_delete on public.audit_log;
create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.audit_log_block_changes();

drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_block_changes();

-- Belt and braces: take the privileges away as well.
revoke update, delete, truncate on public.audit_log
  from public, anon, authenticated, service_role;
