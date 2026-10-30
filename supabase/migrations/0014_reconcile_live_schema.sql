-- ============================================================
-- Reconcile the live database with the migration files
--
-- The original 0014 slot was never used -- no file with that number
-- exists anywhere in git history, and nothing in the live database
-- is unaccounted for by 0001-0013 / 0015-0017. This migration fills
-- the slot with the drift found when the live DB (project
-- zxqgqkkibohflfyrmjnq) was cross-referenced against the files on
-- 2026-10-30:
--
--   1. 0008_room_assignment_history.sql was never applied:
--      room_assignments does not exist and room_status has no
--      'inactive' value, but lib/actions.ts and
--      components/tenant-detail-content.tsx both depend on them.
--   2. 14 indexes declared in 0002_actual_schema.sql are missing.
--   3. Three objects exist under different names than the files use
--      (same definitions, names only).
--
-- Every statement is guarded, so this is safe to run against the
-- live database as well as a fresh one built from 0002 onward.
-- ============================================================


-- ---------- 1. Re-apply 0008 (room assignment history) ----------

create table if not exists public.room_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  room_id uuid not null references public.rooms(id),
  dorm_id uuid references public.dormitories(id),
  started_at date not null default current_date,
  ended_at date,
  created_at timestamptz not null default now()
);

create index if not exists room_assignments_tenant_id_idx
  on public.room_assignments (tenant_id);
create index if not exists room_assignments_room_id_idx
  on public.room_assignments (room_id);
create index if not exists room_assignments_dorm_id_idx
  on public.room_assignments (dorm_id);

-- A tenant can only be in one room at a time.
create unique index if not exists room_assignments_active_tenant_idx
  on public.room_assignments (tenant_id)
  where ended_at is null;

-- Backfill currently-assigned tenants. Skips any tenant that already
-- has an open assignment, so re-running this file is harmless.
insert into public.room_assignments (tenant_id, room_id, dorm_id, started_at)
select t.id, t.room_id, t.dorm_id, t.move_in_date
from public.tenants t
where t.room_id is not null
  and not exists (
    select 1 from public.room_assignments ra
    where ra.tenant_id = t.id and ra.ended_at is null
  );

-- Not in 0008: every other public table has RLS on. The app reads and
-- writes room_assignments through the service-role client
-- (lib/supabase/admin.ts), which bypasses RLS, so this changes nothing
-- for the app -- it only stops the table being readable/writable with
-- the publishable key.
alter table public.room_assignments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'room_assignments'
      and policyname = 'Owners manage room assignments in their dormitory'
  ) then
    create policy "Owners manage room assignments in their dormitory"
      on public.room_assignments for all
      using (is_owner() and dorm_id = user_dorm_id())
      with check (is_owner() and dorm_id = user_dorm_id());
  end if;
end $$;

-- Owner-controlled room deactivation (distinct from 'maintenance').
alter type public.room_status add value if not exists 'inactive';


-- ---------- 2. Indexes declared in 0002 but missing live ----------

create index if not exists users_dorm_id_idx on public.users (dorm_id);
create index if not exists rooms_dorm_id_idx on public.rooms (dorm_id);
create index if not exists tenants_room_id_idx on public.tenants (room_id);
create index if not exists tenants_dorm_id_idx on public.tenants (dorm_id);
create index if not exists bills_tenant_id_idx on public.bills (tenant_id);
create index if not exists bills_status_idx on public.bills (status);
create index if not exists payments_bill_id_idx on public.payments (bill_id);
create index if not exists payments_tenant_id_idx on public.payments (tenant_id);
create index if not exists transactions_type_idx on public.transactions (type);
create index if not exists transactions_occurred_at_idx on public.transactions (occurred_at);
create index if not exists transactions_dorm_id_idx on public.transactions (dorm_id);


-- ---------- 3. Rename drifted objects to match the files ----------

-- 0011 names this payments_one_pending_per_bill_idx.
alter index if exists public.payments_one_pending_per_bill
  rename to payments_one_pending_per_bill_idx;

-- 0012 policy names. Definitions are already identical; only the
-- names differ.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'maintenance_requests'
      and policyname = 'Owners manage maintenance requests in their dorm'
  ) then
    alter policy "Owners manage maintenance requests in their dorm"
      on public.maintenance_requests
      rename to "Owners manage maintenance requests in their dormitory";
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'maintenance_requests'
      and policyname = 'Tenants create their own maintenance requests'
  ) then
    alter policy "Tenants create their own maintenance requests"
      on public.maintenance_requests
      rename to "Tenants submit their own maintenance requests";
  end if;
end $$;
