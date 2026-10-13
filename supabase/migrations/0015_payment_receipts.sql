-- ============================================================
-- Payment receipts
--
-- Every confirmed rent-bill payment (public.payments, status =
-- 'confirmed') can have a receipt generated for it -- the receipt
-- number is minted lazily, the first time anyone actually opens a
-- receipt for that payment (get_or_create_receipt_number below),
-- not proactively for every payment up front. Reopening or
-- re-downloading the same receipt always returns the same number:
-- once a payment has one, this function just returns it.
--
-- Utility bill payments (public.utility_bills) are deliberately out
-- of scope -- they're room-level with no individual tenant_id
-- recorded (see migration 0013's own notes on why: the app never
-- auto-divides a room's utility bill among tenants), so there's no
-- honest "this tenant paid this" attribution to put on a receipt.
--
-- receipt_number format: 'RCPT-000001', globally sequential (not
-- scoped per dorm) -- matches "DormVision-Receipt-RCPT-000001.pdf"
-- as the expected download filename.
-- ============================================================

alter table public.payments
  add column if not exists receipt_number text;

create unique index if not exists payments_receipt_number_idx
  on public.payments (receipt_number)
  where receipt_number is not null;

create sequence if not exists public.payments_receipt_number_seq;

-- security definer + explicit search_path: callable via supabase-js's
-- .rpc() through the service-role client (same convention as
-- is_owner()/user_dorm_id() in 0002_actual_schema.sql). The `select
-- ... for update` row lock serializes concurrent calls for the same
-- payment_id -- a second caller blocks on the lock until the first
-- transaction commits its UPDATE, then sees the now-non-null
-- receipt_number and returns that instead of minting a second one.
create or replace function public.get_or_create_receipt_number(p_payment_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_number text;
begin
  select receipt_number into v_number
  from public.payments
  where id = p_payment_id
  for update;

  if v_number is not null then
    return v_number;
  end if;

  v_number := 'RCPT-' || lpad(nextval('public.payments_receipt_number_seq')::text, 6, '0');

  update public.payments
  set receipt_number = v_number
  where id = p_payment_id;

  return v_number;
end;
$$;
