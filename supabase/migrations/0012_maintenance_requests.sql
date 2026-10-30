-- ============================================================
-- Maintenance requests
--
-- Originally reconstructed from lib/actions.ts, the tenant/admin
-- maintenance pages and the dashboard, because the original file was
-- never saved to git. Since then it has been CHECKED AGAINST THE LIVE
-- DATABASE (2026-10-30, via the REST schema): table, column names and
-- types, nullability, defaults and the status enum below now match
-- production exactly -- including the enum's real name
-- (maintenance_request_status) and the owner_notes column, which the
-- first reconstruction had wrong/missing.
--
-- Still reconstructed, not verified: the indexes and the RLS
-- policies at the bottom (they are not visible through the REST
-- schema).
--
-- Guarded so it is safe to run where the table already exists.
--
-- RLS note: like the rest of this schema, the app reaches Postgres
-- through the service-role client with authorization checked in
-- server actions, so these policies are defense-in-depth, not the
-- enforcement path.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'maintenance_request_status') then
    create type public.maintenance_request_status as enum (
      'pending',
      'acknowledged',
      'in_progress',
      'completed',
      'rejected'
    );
  end if;
end $$;

create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dormitories(id),
  tenant_id uuid not null references public.tenants(id),
  room_id uuid references public.rooms(id),
  title text not null,
  description text,
  status public.maintenance_request_status not null default 'pending',
  acknowledged_at timestamptz,
  completed_at timestamptz,
  owner_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_requests_dorm_id_idx
  on public.maintenance_requests (dorm_id);
create index if not exists maintenance_requests_tenant_id_idx
  on public.maintenance_requests (tenant_id);
create index if not exists maintenance_requests_status_idx
  on public.maintenance_requests (status);

alter table public.maintenance_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'maintenance_requests'
      and policyname = 'Owners manage maintenance requests in their dormitory'
  ) then
    create policy "Owners manage maintenance requests in their dormitory"
      on public.maintenance_requests for all
      using (is_owner() and dorm_id = user_dorm_id())
      with check (is_owner() and dorm_id = user_dorm_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'maintenance_requests'
      and policyname = 'Tenants view their own maintenance requests'
  ) then
    create policy "Tenants view their own maintenance requests"
      on public.maintenance_requests for select
      using (
        tenant_id in (select id from public.tenants where profile_id = auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'maintenance_requests'
      and policyname = 'Tenants submit their own maintenance requests'
  ) then
    create policy "Tenants submit their own maintenance requests"
      on public.maintenance_requests for insert
      with check (
        tenant_id in (select id from public.tenants where profile_id = auth.uid())
      );
  end if;
end $$;
