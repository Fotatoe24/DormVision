-- ============================================================
-- DormVision — schema resync
--
-- 0001_init.sql describes an older single-dormitory "profiles"/
-- "admin" design that the application no longer uses. Real
-- multi-tenant support (dormitories, join codes, dorm_id on
-- every table, "owner"/"tenant" roles) was added directly against
-- the live Supabase project outside of migration tracking, so it
-- was never captured in git until now.
--
-- Every statement in this file was verified against the live
-- production database on 2026-08-16 via read-only introspection
-- run by the project owner in the Supabase SQL editor:
--   - table/column/constraint shapes: Supabase's own schema export
--   - RLS policies: `select * from pg_policies where schemaname = 'public'`
--   - function bodies: `select pg_get_functiondef(oid) from pg_proc ...`
--   - triggers: `select * from information_schema.triggers ...`
--     (returned zero rows — there are NO triggers anywhere in the
--     public schema; nothing auto-creates users/dormitories rows on
--     sign-up, and nothing auto-stamps `updated_at`)
--
-- This file documents already-existing production state. Applying
-- it again against that same project will fail (objects already
-- exist) — it exists for version-control parity and to correctly
-- bootstrap a fresh database (local dev, staging, disaster
-- recovery).
--
-- One exception: the `dorm_settings` RLS policy below was applied
-- live for the first time on 2026-08-16, as an emergency fix — the
-- table had RLS disabled in production (every row readable/writable
-- by anyone with the public anon key, no auth required) until this
-- fix was applied via the SQL editor. It's captured here so it's no
-- longer dashboard-only.
-- ============================================================

-- ---------- enums ----------
create type user_role as enum ('owner', 'tenant');
create type room_status as enum ('available', 'full', 'maintenance');
create type tenant_status as enum ('active', 'inactive', 'moved_out');
create type bill_status as enum ('unpaid', 'partial', 'paid', 'overdue');
create type payment_method as enum ('cash', 'bank_transfer', 'gcash', 'other');
create type transaction_type as enum ('income', 'expense');
create type transaction_category as enum (
  'rent', 'other_income', 'utilities', 'repairs', 'supplies', 'other_expense'
);

-- ---------- dormitories / users (circular FK, created together) ----------
-- dormitories.owner_id -> users(id) and users.dorm_id -> dormitories(id)
-- reference each other. Create dormitories without the owner_id FK first,
-- add users, then wire up the FK afterward — matches how the live DB
-- ended up structured.
create table dormitories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null,
  join_code text not null unique
    default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  address text,
  contact_number text,
  email text,
  operating_hours text,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key references auth.users(id),
  role user_role not null default 'tenant',
  full_name text not null,
  email text not null,
  phone text,
  created_at timestamptz not null default now(),
  dorm_id uuid references dormitories(id),
  emergency_contact_name text,
  emergency_contact_number text,
  avatar_url text,
  avatar_color text not null default '#1f4d3d'
);
-- NB: the primary key constraint is still physically named "profiles_pkey"
-- in the live DB, a leftover from a profiles -> users rename. Cosmetic only.

alter table dormitories
  add constraint dormitories_owner_id_fkey foreign key (owner_id) references users(id);

create index if not exists users_dorm_id_idx on users (dorm_id);

-- ---------- rooms ----------
create table rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text not null unique,
  capacity int not null check (capacity > 0),
  monthly_rate numeric(10, 2) not null check (monthly_rate >= 0),
  status room_status not null default 'available',
  created_at timestamptz not null default now(),
  dorm_id uuid references dormitories(id)
);

create index if not exists rooms_dorm_id_idx on rooms (dorm_id);

-- ---------- tenants ----------
create table tenants (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references users(id),
  room_id uuid references rooms(id),
  full_name text not null,
  contact_number text,
  emergency_contact_name text,
  emergency_contact_number text,
  move_in_date date not null default current_date,
  move_out_date date,
  status tenant_status not null default 'active',
  created_at timestamptz not null default now(),
  dorm_id uuid references dormitories(id)
);

create index if not exists tenants_room_id_idx on tenants (room_id);
create index if not exists tenants_dorm_id_idx on tenants (dorm_id);

-- ---------- bills ----------
-- NOTE: bills has its own `dorm_id` column (and the app's server actions
-- filter writes by it directly), but the RLS policy below does NOT use
-- that column — it authorizes via a `tenants` subquery instead. Both are
-- correct as long as bills.dorm_id always matches its tenant's dorm_id;
-- worth keeping in mind if the two are ever allowed to drift.
create table bills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  room_id uuid references rooms(id),
  billing_period_start date not null,
  billing_period_end date not null,
  due_date date not null,
  rent_amount numeric(10, 2) not null default 0,
  other_charges numeric(10, 2) not null default 0,
  -- Plain DEFAULT, not a GENERATED/STORED column — total_amount is
  -- computed once at insert time and will NOT auto-update if
  -- rent_amount/other_charges are edited on an existing row.
  total_amount numeric(10, 2) default (rent_amount + other_charges),
  amount_paid numeric(10, 2) not null default 0,
  status bill_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  dorm_id uuid references dormitories(id),
  charges_note text
);

create index if not exists bills_tenant_id_idx on bills (tenant_id);
create index if not exists bills_status_idx on bills (status);
create index if not exists bills_dorm_id_idx on bills (dorm_id);

-- ---------- payments ----------
create table payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id),
  tenant_id uuid not null references tenants(id),
  amount numeric(10, 2) not null check (amount > 0),
  method payment_method not null default 'cash',
  paid_at timestamptz not null default now(),
  recorded_by uuid references users(id),
  notes text
);

create index if not exists payments_bill_id_idx on payments (bill_id);
create index if not exists payments_tenant_id_idx on payments (tenant_id);

-- ---------- transactions (income & expenses ledger — not yet used by the app) ----------
create table transactions (
  id uuid primary key default gen_random_uuid(),
  type transaction_type not null,
  category transaction_category not null,
  amount numeric(10, 2) not null check (amount > 0),
  description text,
  related_bill_id uuid references bills(id),
  recorded_by uuid references users(id),
  occurred_at date not null default current_date,
  created_at timestamptz not null default now(),
  dorm_id uuid references dormitories(id)
);

create index if not exists transactions_type_idx on transactions (type);
create index if not exists transactions_occurred_at_idx on transactions (occurred_at);
create index if not exists transactions_dorm_id_idx on transactions (dorm_id);

-- ---------- dorm_settings ----------
create table dorm_settings (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null unique references dormitories(id),
  billing_due_day int not null default 1 check (billing_due_day between 1 and 31),
  grace_period_days int not null default 0 check (grace_period_days >= 0),
  late_payment_fee numeric(10, 2) not null default 0 check (late_payment_fee >= 0),
  enable_payment_reminders boolean not null default true,
  enable_overdue_notifications boolean not null default true,
  allow_tenant_registration boolean not null default false,
  allow_room_transfers boolean not null default true,
  require_transfer_approval boolean not null default true,
  enable_new_tenant_notifications boolean not null default true,
  enable_maintenance_notifications boolean not null default true,
  allow_maintenance_requests boolean not null default true,
  require_maintenance_approval boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- No trigger stamps `updated_at` on change (confirmed: no such trigger
-- exists anywhere in the public schema). It will stay at its insert-time
-- value forever unless a future migration adds one, or the application
-- sets it explicitly on every update.

-- ============================================================
-- Functions (verbatim from the live database)
-- ============================================================

create or replace function public.is_owner()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role = 'owner'
  );
$function$;

create or replace function public.user_dorm_id()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  SELECT dorm_id
  FROM public.users
  WHERE id = auth.uid();
$function$;

create or replace function public.user_room_id()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  SELECT room_id
  FROM tenants
  WHERE profile_id = auth.uid()
  LIMIT 1;
$function$;

create or replace function public.lookup_dormitory_by_code(p_code text)
 returns table(id uuid, name text)
 language sql
 stable security definer
as $function$
  SELECT id, name
  FROM public.dormitories
  WHERE join_code = UPPER(p_code);
$function$;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table users enable row level security;
alter table dormitories enable row level security;
alter table rooms enable row level security;
alter table tenants enable row level security;
alter table bills enable row level security;
alter table payments enable row level security;
alter table transactions enable row level security;
alter table dorm_settings enable row level security;

-- ---------- users ----------
create policy "Users view their own row"
  on users for select
  using (id = auth.uid());

create policy "Users update their own row"
  on users for update
  using (id = auth.uid());

create policy "Users can insert their own row"
  on users for insert
  with check (id = auth.uid());

-- Duplicate of the policy above (same command, same check) — both exist
-- live. Harmless but redundant; a future cleanup migration could drop one.
create policy "Users insert their own row on sign-up"
  on users for insert
  with check (id = auth.uid());

create policy "Owners view users in their dormitory"
  on users for select
  using (is_owner() and dorm_id = user_dorm_id());

-- ---------- dormitories ----------
create policy "Members view their own dormitory"
  on dormitories for select
  using (id = user_dorm_id());

create policy "Owners can insert their own dormitory"
  on dormitories for insert
  with check (owner_id = auth.uid());

create policy "Owners manage their own dormitory"
  on dormitories for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------- rooms ----------
create policy "Members view rooms in their dormitory"
  on rooms for select
  using (dorm_id = user_dorm_id());

create policy "Owners manage rooms in their dormitory"
  on rooms for all
  using (is_owner() and dorm_id = user_dorm_id())
  with check (is_owner() and dorm_id = user_dorm_id());

-- ---------- tenants ----------
create policy "Owners manage tenants in their dormitory"
  on tenants for all
  using (is_owner() and dorm_id = user_dorm_id())
  with check (is_owner() and dorm_id = user_dorm_id());

create policy "Tenants view their own record"
  on tenants for select
  using (profile_id = auth.uid());

create policy "Tenants view their roommates"
  on tenants for select
  using (room_id is not null and room_id = user_room_id());

-- ---------- bills ----------
create policy "Owners manage bills in their dormitory"
  on bills for all
  using (
    is_owner()
    and tenant_id in (select id from tenants where dorm_id = user_dorm_id())
  );

create policy "Tenants view their own bills"
  on bills for select
  using (
    tenant_id in (select id from tenants where profile_id = auth.uid())
  );

-- ---------- payments ----------
create policy "Owners manage payments in their dormitory"
  on payments for all
  using (
    is_owner()
    and tenant_id in (select id from tenants where dorm_id = user_dorm_id())
  );

create policy "Tenants view their own payments"
  on payments for select
  using (
    tenant_id in (select id from tenants where profile_id = auth.uid())
  );

-- ---------- transactions ----------
create policy "Owners manage transactions in their dormitory"
  on transactions for all
  using (is_owner() and dorm_id = user_dorm_id())
  with check (is_owner() and dorm_id = user_dorm_id());

-- ---------- dorm_settings ----------
-- Applied live on 2026-08-16 as an emergency fix (RLS had been disabled
-- since the table was created — see header note above).
create policy "Owners manage their dorm settings"
  on dorm_settings for all
  using (is_owner() and dorm_id = user_dorm_id())
  with check (is_owner() and dorm_id = user_dorm_id());