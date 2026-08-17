-- ============================================================
-- Room assignment history + owner-controlled room deactivation
--
-- Fixes two real bugs found during a full audit:
--
-- 1. removeTenantFromRoom set the tenant's status to 'inactive' on
--    unassignment, which is wrong -- 'inactive' should mean the
--    account was deliberately deactivated, not "currently between
--    rooms". Worse, app/admin/rooms/page.tsx's "Unassigned tenants"
--    list (the only UI anywhere that can assign a tenant to a room)
--    filters on status = 'active', so an unassigned tenant literally
--    disappeared from the only place that could reassign them --
--    confirmed by reading the actual query, not assumed.
--
-- 2. Only the tenant's *current* room_id and one move_in/move_out
--    pair were ever stored -- a second reassignment overwrote the
--    first, so no real history of past stays existed. This table
--    fixes that going forward.
--
-- Note: tenants who were already unassigned before this migration
-- ran have no recoverable room_id (it was already overwritten to
-- null when they were removed) -- their prior stays cannot be
-- backfilled. History starts here for them; this is a genuine data
-- gap, not a bug in this migration.
-- ============================================================

create table public.room_assignments (
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
create unique index room_assignments_active_tenant_idx
  on public.room_assignments (tenant_id)
  where ended_at is null;

-- Backfill currently-active assignments from the tenants table --
-- the only history that's actually recoverable.
insert into public.room_assignments (tenant_id, room_id, dorm_id, started_at)
select id, room_id, dorm_id, move_in_date
from public.tenants
where room_id is not null;

-- Lets an owner deliberately take a room out of service (distinct
-- from 'maintenance', which is meant to be temporary) without it
-- being available for new assignments. Application code is
-- responsible for blocking assignment into 'inactive' rooms and for
-- refusing to deactivate a room that currently has active occupants.
alter type room_status add value if not exists 'inactive';
