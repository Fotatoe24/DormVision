-- ============================================================
-- Reminder emails: remember what has been sent
--
-- The daily job (app/api/cron/daily) emails tenants a payment reminder shortly
-- before a bill is due and an overdue notice once it is late. It runs every
-- day, so without a record it would send the same email every day. One row here
-- means "this kind of email has been sent for this bill"; the unique key makes
-- that claim atomic, so even two overlapping runs send it only once.
--
-- Server-only: RLS on, no policies, so the public API key can read and write
-- none of it (same posture as every other table here).
-- ============================================================

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  kind text not null check (kind in ('payment_reminder', 'overdue_notice')),
  sent_at timestamptz not null default now(),
  unique (bill_id, kind)
);

alter table public.notification_log enable row level security;
