-- ============================================================
-- Tenant-reported payment confirmation workflow
--
-- RECONSTRUCTED from lib/actions.ts (reportPayment,
-- confirmPendingPayment, rejectPendingPayment) and the payments /
-- tenant / dashboard pages. The original file was never saved to
-- git, so this was NOT generated from the live database. Compare
-- against the live schema before relying on it as exact.
--
-- Written to be safe to run against a database where these objects
-- already exist (guards on every statement), so it can be committed
-- for version-control parity without breaking anything.
--
-- Key rule: the column default is 'confirmed', because
-- recordPayment (owner-recorded, cash) inserts rows without a
-- status and those must count immediately. Only reportPayment
-- explicitly inserts status = 'pending'.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('pending', 'confirmed', 'rejected');
  end if;
end $$;

alter table public.payments
  add column if not exists status public.payment_status not null default 'confirmed',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.users(id);

-- At most one pending report per bill -- the database-level backstop
-- behind the check in reportPayment, which only gives a friendly
-- message and can't prevent a race on its own.
create unique index if not exists payments_one_pending_per_bill_idx
  on public.payments (bill_id)
  where status = 'pending';

create index if not exists payments_status_idx
  on public.payments (status);
