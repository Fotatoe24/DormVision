-- ============================================================
-- Water & electricity billing
--
-- Separate from `bills` (which is per-tenant rent + other charges).
-- A utility bill is assigned to a ROOM, not a tenant: the owner
-- records the total water/electricity cost for that room for a
-- period, and the room's tenants are left to split and pay it
-- amongst themselves -- the app never auto-divides the total. The
-- owner marks it paid/partial directly once they've actually
-- received the money, the same way recordPayment works for rent
-- (see lib/actions.ts's recordUtilityPayment), since the utility
-- accounts are in the owner's name and payment goes straight to them
-- rather than through the tenant "I've Paid" report/confirm flow.
--
-- Reuses the existing bill_status enum ('unpaid' | 'partial' | 'paid'
-- | 'overdue') rather than defining a near-duplicate one -- the
-- lifecycle (unpaid -> partial -> paid, overdue derived from due_date
-- at render time) is identical to a rent bill's, and
-- lib/billing.ts's displayBillStatus()/billStatusStyles already work
-- on any {status, due_date} shape.
-- ============================================================

create table if not exists public.utility_bills (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dormitories(id),
  room_id uuid not null references public.rooms(id),

  billing_period_start date not null,
  billing_period_end date not null,
  due_date date not null,

  water_amount numeric(10, 2) not null default 0 check (water_amount >= 0),
  electricity_amount numeric(10, 2) not null default 0 check (electricity_amount >= 0),
  -- Same reasoning as bills.total_amount: must be GENERATED, not a plain
  -- DEFAULT, since a plain default can't reference sibling columns.
  total_amount numeric(10, 2) generated always as (water_amount + electricity_amount) stored,
  amount_paid numeric(10, 2) not null default 0,
  status bill_status not null default 'unpaid',

  notes text,
  created_at timestamptz not null default now(),

  constraint utility_bills_amount_positive
    check (water_amount > 0 or electricity_amount > 0)
);

create index if not exists utility_bills_dorm_id_idx on public.utility_bills (dorm_id);
create index if not exists utility_bills_room_id_idx on public.utility_bills (room_id);
create index if not exists utility_bills_status_idx on public.utility_bills (status);

alter table public.utility_bills enable row level security;

-- RLS note: as elsewhere in this schema, these policies are for schema
-- correctness and defense-in-depth, not the real enforcement -- auth.uid()
-- is always null post-custom-auth-migration, so every read/write actually
-- goes through the service-role client with authorization checked
-- explicitly in the server action (requireOwnerDormId(), explicit
-- dorm_id/room_id filters).
create policy "Owners manage utility bills in their dormitory"
  on public.utility_bills
  using (is_owner() and dorm_id = user_dorm_id())
  with check (is_owner() and dorm_id = user_dorm_id());

-- Visible to every tenant assigned to the room, not just one of them --
-- mirrors "Tenants view their roommates" on the tenants table, which
-- uses the same room_id = user_room_id() check for the same reason.
create policy "Tenants view utility bills for their room"
  on public.utility_bills
  for select
  using (room_id is not null and room_id = user_room_id());
