-- ============================================================
-- Late payment fees
--
-- Settings -> "Late payment fee" has been saved per dorm
-- (dorm_settings.late_payment_fee) but nothing ever charged it. This makes it
-- real:
--
--   * bills.late_fee         the fee actually charged on THIS bill (0 = none)
--   * bills.late_fee_charged_at / late_fee_waived_at   when it was charged /
--                            when the owner waived it
--   * bills.total_amount     now rent + other charges + late fee, so every
--                            balance, invoice and payment check that already
--                            reads total_amount picks the fee up automatically
--   * charge_late_fees()     charges the fee, ONCE per bill, on bills that are
--                            past due date + grace period and not paid off
--
-- Rules:
--   - One fee per bill, ever. A bill that has a fee, or whose fee was waived,
--     is never charged again.
--   - Paid bills are never charged.
--   - "Past due" is judged in Manila time, the same day boundary the app uses
--     for "overdue" (due date + grace days, from the start of the next day).
--   - Rent bills only; utility bills are not charged a fee.
--   - A fee of 0 in Settings charges nothing.
--
-- Safe to re-run.
-- ============================================================

alter table public.bills
  add column if not exists late_fee numeric(10, 2) not null default 0
    check (late_fee >= 0),
  add column if not exists late_fee_charged_at timestamptz,
  add column if not exists late_fee_waived_at timestamptz;

-- total_amount is a GENERATED column, so the fee can only be added into it by
-- changing its expression (PostgreSQL 17+; Supabase runs 17). No view or
-- function depends on it.
alter table public.bills
  alter column total_amount set expression as (rent_amount + other_charges + late_fee);

-- ---------- Charging ----------

create or replace function public.charge_late_fees(p_dorm_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee   numeric(10, 2);
  v_grace integer;
  v_count integer;
begin
  select late_payment_fee, grace_period_days
    into v_fee, v_grace
    from public.dorm_settings
   where dorm_id = p_dorm_id;

  if v_fee is null or v_fee <= 0 then
    return 0;
  end if;

  update public.bills
     set late_fee = v_fee,
         late_fee_charged_at = now()
   where dorm_id = p_dorm_id
     and status <> 'paid'
     and late_fee = 0
     and late_fee_waived_at is null
     and (now() at time zone 'Asia/Manila')::date > due_date + coalesce(v_grace, 0);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Server-only, like every other function here (see 0023).
revoke all on function public.charge_late_fees(uuid) from public, anon, authenticated;
grant execute on function public.charge_late_fees(uuid) to service_role;
