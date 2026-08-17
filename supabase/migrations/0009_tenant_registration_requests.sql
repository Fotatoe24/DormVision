-- ============================================================
-- Tenant registration approval workflow
--
-- Signing up with a Dorm ID used to insert directly into
-- public.tenants, immediately counting the signer as an active
-- tenant -- affecting occupancy, billing, and every financial
-- calculation before a dorm owner ever saw them. This table
-- separates "someone asked to join" from "someone is a tenant":
-- signup now creates a row here (status='pending') instead of in
-- tenants, and public.tenants only ever gets a new row when an owner
-- explicitly approves a request (see approveRegistrationRequest in
-- lib/actions.ts).
--
-- Because pending/rejected/cancelled applicants never touch
-- public.tenants at all, every existing calculation that reads from
-- tenants (occupancy, dashboard counts, billing, the financial
-- summary added in 0008-era work) is already correct by construction
-- -- no scattered status filters needed anywhere else in the app.
--
-- RLS note: like every other table in this schema, these policies
-- are for schema correctness and defense-in-depth, not the actual
-- enforcement mechanism -- this app moved off Supabase Auth sessions
-- entirely earlier in its history, so auth.uid() is always null at
-- runtime and every read/write goes through the service-role client
-- with authorization checked explicitly in the server action itself
-- (requireOwnerDormId(), explicit dorm_id/user_id filters). That's
-- where "not just hiding buttons" is actually enforced here.
-- ============================================================

create type registration_request_status as enum (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

create table public.tenant_registration_requests (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dormitories(id),
  user_id uuid not null references public.users(id),

  -- Snapshot of what was submitted with this specific request, not a
  -- live join to users -- may differ from the account's current
  -- profile info (e.g. a later re-apply with an updated phone
  -- number), which is the point.
  full_name text not null,
  email text not null,
  contact_number text,

  -- Freeform, not a room_id FK: an applicant has no way to browse a
  -- dorm's actual room list before their account is even approved,
  -- so this is a stated preference for the owner to read, never a
  -- binding reservation. Actual assignment only ever happens through
  -- assignTenantToRoom after approval.
  requested_room_note text,
  message text,

  status registration_request_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id),
  rejection_reason text,

  created_at timestamptz not null default now()
);

create index tenant_registration_requests_dorm_id_idx
  on public.tenant_registration_requests (dorm_id);
create index tenant_registration_requests_user_id_idx
  on public.tenant_registration_requests (user_id);
create index tenant_registration_requests_status_idx
  on public.tenant_registration_requests (status);

-- A user can have at most one PENDING request per dorm at a time --
-- the database-level guarantee behind "prevent duplicate requests",
-- independent of whichever UI path (signup, or a later re-apply)
-- creates the row.
create unique index tenant_registration_requests_pending_unique_idx
  on public.tenant_registration_requests (user_id, dorm_id)
  where status = 'pending';

alter table public.tenant_registration_requests enable row level security;

create policy "Applicants view their own registration requests"
  on public.tenant_registration_requests for select
  using (user_id = auth.uid());

create policy "Applicants insert their own registration requests"
  on public.tenant_registration_requests for insert
  with check (user_id = auth.uid());

create policy "Owners manage registration requests for their dormitory"
  on public.tenant_registration_requests for all
  using (is_owner() and dorm_id = user_dorm_id())
  with check (is_owner() and dorm_id = user_dorm_id());
