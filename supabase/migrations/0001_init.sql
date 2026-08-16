-- ============================================================
-- DormVision — Phase 0 core schema
-- Dormitory Management & Accounting Information System
--
-- ⚠️ SUPERSEDED — kept for history only, does not reflect the
-- live database. This described an early single-dormitory
-- "profiles"/"admin" design; production moved to a multi-tenant
-- schema ("users", "dormitories", dorm_id everywhere, "owner"/
-- "tenant" roles) directly in the Supabase dashboard, without
-- ever being captured as a migration until 0002_actual_schema.sql,
-- which was verified against the live database and is the
-- current source of truth. Do not apply this file to a fresh
-- database — use 0002 instead.
-- ============================================================

-- ---------- profiles (extends auth.users with a role) ----------
create type user_role as enum ('admin', 'tenant');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'tenant',
  full_name text not null,
  email text not null,
  phone text,
  created_at timestamptz not null default now()
);

-- ---------- rooms ----------
create type room_status as enum ('available', 'full', 'maintenance');

create table rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text not null unique,
  capacity int not null check (capacity > 0),
  monthly_rate numeric(10, 2) not null check (monthly_rate >= 0),
  status room_status not null default 'available',
  created_at timestamptz not null default now()
);

-- ---------- tenants ----------
create type tenant_status as enum ('active', 'inactive', 'moved_out');

create table tenants (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  room_id uuid references rooms(id) on delete set null,
  full_name text not null,
  contact_number text,
  emergency_contact_name text,
  emergency_contact_number text,
  move_in_date date not null default current_date,
  move_out_date date,
  status tenant_status not null default 'active',
  created_at timestamptz not null default now()
);

create index tenants_room_id_idx on tenants (room_id);

-- ---------- bills ----------
create type bill_status as enum ('unpaid', 'partial', 'paid', 'overdue');

create table bills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  room_id uuid references rooms(id) on delete set null,
  billing_period_start date not null,
  billing_period_end date not null,
  due_date date not null,
  rent_amount numeric(10, 2) not null default 0,
  other_charges numeric(10, 2) not null default 0,
  total_amount numeric(10, 2) generated always as (rent_amount + other_charges) stored,
  amount_paid numeric(10, 2) not null default 0,
  status bill_status not null default 'unpaid',
  created_at timestamptz not null default now()
);

create index bills_tenant_id_idx on bills (tenant_id);
create index bills_status_idx on bills (status);

-- ---------- payments ----------
create type payment_method as enum ('cash', 'bank_transfer', 'gcash', 'other');

create table payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  method payment_method not null default 'cash',
  paid_at timestamptz not null default now(),
  recorded_by uuid references profiles(id),
  notes text
);

create index payments_bill_id_idx on payments (bill_id);
create index payments_tenant_id_idx on payments (tenant_id);

-- ---------- transactions (income & expenses, for accounting/monitoring) ----------
create type transaction_type as enum ('income', 'expense');
create type transaction_category as enum (
  'rent', 'other_income', 'utilities', 'repairs', 'supplies', 'other_expense'
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  type transaction_type not null,
  category transaction_category not null,
  amount numeric(10, 2) not null check (amount > 0),
  description text,
  related_bill_id uuid references bills(id) on delete set null,
  recorded_by uuid references profiles(id),
  occurred_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index transactions_type_idx on transactions (type);
create index transactions_occurred_at_idx on transactions (occurred_at);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table profiles enable row level security;
alter table rooms enable row level security;
alter table tenants enable row level security;
alter table bills enable row level security;
alter table payments enable row level security;
alter table transactions enable row level security;

-- Helper: is the current user an admin?
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------- profiles ----------
create policy "Admins manage all profiles"
  on profiles for all
  using (is_admin());

create policy "Users read their own profile"
  on profiles for select
  using (id = auth.uid());

-- ---------- rooms (admin-only; not tenant-sensitive but still gated) ----------
create policy "Admins manage rooms"
  on rooms for all
  using (is_admin());

create policy "Tenants view rooms"
  on rooms for select
  using (auth.uid() is not null);

-- ---------- tenants ----------
create policy "Admins manage tenants"
  on tenants for all
  using (is_admin());

create policy "Tenants view their own record"
  on tenants for select
  using (profile_id = auth.uid());

-- ---------- bills ----------
create policy "Admins manage bills"
  on bills for all
  using (is_admin());

create policy "Tenants view their own bills"
  on bills for select
  using (
    tenant_id in (select id from tenants where profile_id = auth.uid())
  );

-- ---------- payments ----------
create policy "Admins manage payments"
  on payments for all
  using (is_admin());

create policy "Tenants view their own payments"
  on payments for select
  using (
    tenant_id in (select id from tenants where profile_id = auth.uid())
  );

-- ---------- transactions (admin-only — income/expense ledger) ----------
create policy "Admins manage transactions"
  on transactions for all
  using (is_admin());