-- ============================================================
-- Bill invoices
--
-- Counterpart to migration 0015's payment receipts, same lazy-mint
-- pattern: every rent bill (public.bills) can have an invoice
-- generated for it -- the invoice number is minted the first time
-- anyone opens one, not proactively for every bill up front.
-- Reopening or re-downloading the same invoice always returns the
-- same number.
--
-- Unlike a receipt, an invoice represents what's owed on a bill, not
-- a single confirmed payment against it -- it's available for any
-- bill regardless of payment status (unpaid, partial, or even fully
-- paid, as a record of what was billed).
--
-- Utility bills are deliberately out of scope, for the same reason
-- migration 0015 excludes them from receipts: they're room-level with
-- no individual tenant_id, so there's no single tenant an invoice
-- could honestly be addressed to.
--
-- invoice_number format: 'INV-000001', globally sequential (not
-- scoped per dorm) -- matches "DormVision-Invoice-INV-000001.pdf" as
-- the expected download filename.
-- ============================================================

alter table public.bills
  add column if not exists invoice_number text;

create unique index if not exists bills_invoice_number_idx
  on public.bills (invoice_number)
  where invoice_number is not null;

create sequence if not exists public.bills_invoice_number_seq;

-- security definer + explicit search_path, same convention as
-- get_or_create_receipt_number (0015). The `select ... for update` row
-- lock serializes concurrent calls for the same bill_id.
create or replace function public.get_or_create_invoice_number(p_bill_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_number text;
begin
  select invoice_number into v_number
  from public.bills
  where id = p_bill_id
  for update;

  if v_number is not null then
    return v_number;
  end if;

  v_number := 'INV-' || lpad(nextval('public.bills_invoice_number_seq')::text, 6, '0');

  update public.bills
  set invoice_number = v_number
  where id = p_bill_id;

  return v_number;
end;
$$;
