import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateMonthlyBills,
  createBill,
  recordPayment,
  deleteBill,
} from "@/lib/actions";
import {
  billStatusStyles as statusStyles,
  formatMoney,
  formatBillDate as formatDate,
  displayBillStatus as displayStatus,
} from "@/lib/billing";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";

const labelClass = "mb-1.5 block text-xs font-medium text-foreground-muted";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;

  const session = await getSessionUser();

  if (!session) redirect("/");

  if (session.profile?.role !== "owner") {
    redirect("/tenant");
  }

  const dormId = session.profile.dorm_id;

  if (!dormId) {
    redirect("/admin?error=No+dormitory+assigned");
  }

  const supabase = createAdminClient();

  // ============================================================
  // LOAD BILLS
  // ============================================================

  const { data: bills, error: billsError } = await supabase
    .from("bills")
    .select(
      "id, tenant_id, room_id, billing_period_start, billing_period_end, due_date, rent_amount, other_charges, charges_note, total_amount, amount_paid, status"
    )
    .eq("dorm_id", dormId)
    .order("due_date", { ascending: false });

  if (billsError) {
    console.error("BILLS LOAD ERROR:", billsError);
  }

  // ============================================================
  // LOAD TENANTS
  //
  // IMPORTANT:
  // Billing uses tenants.id, NOT users.id.
  // ============================================================

  const { data: tenants, error: tenantsError } = await supabase
    .from("tenants")
    .select(
      `
      id,
      profile_id,
      full_name,
      room_id,
      dorm_id,
      status
    `
    )
    .eq("dorm_id", dormId)
    .order("full_name");

  // ============================================================
  // LOAD ROOMS
  // ============================================================

  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("id, room_number, monthly_rate")
    .eq("dorm_id", dormId)
    .order("room_number");

  // ============================================================
  // ERROR HANDLING
  // ============================================================

  const loadError =
    billsError?.message || tenantsError?.message || roomsError?.message || null;

  if (loadError) {
    return (
      <main className="flex-1 bg-background px-6 py-10 text-foreground">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-lg border border-status-overdue/30 bg-status-overdue/10 px-4 py-3 text-sm text-status-overdue">
            Could not load billing data: {loadError}
          </div>
        </div>
      </main>
    );
  }

  // ============================================================
  // MAPS
  // ============================================================

  const tenantById = new Map(
    (tenants ?? []).map((tenant) => [tenant.id, tenant])
  );

  const roomById = new Map((rooms ?? []).map((room) => [room.id, room]));

  // ============================================================
  // OUTSTANDING COUNT
  // ============================================================

  const outstandingCount = (bills ?? []).filter(
    (bill) => displayStatus(bill) !== "paid"
  ).length;

  return (
    <main className="flex-1 bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-3xl">
        {/* ======================================================
            HEADER
        ====================================================== */}

        <div className="mb-6">
          <h1 className="font-heading text-lg font-semibold text-primary">
            Billing
          </h1>

          <p className="text-xs text-foreground-muted">
            {outstandingCount === 0
              ? "Every bill is paid up."
              : `${outstandingCount} bill(s) still outstanding.`}
          </p>
        </div>

        {/* ======================================================
            ERROR / SUCCESS
        ====================================================== */}

        {error && (
          <div className="mb-4 rounded-md border border-status-overdue/30 bg-status-overdue/10 px-3 py-2 text-xs text-status-overdue">
            {error}
          </div>
        )}

        {saved && (
          <div className="mb-4 rounded-md border border-status-paid/30 bg-status-paid/10 px-3 py-2 text-xs text-status-paid">
            {saved === "1" ? "Saved." : saved}
          </div>
        )}

        {/* ======================================================
            GENERATE MONTHLY BILLS
        ====================================================== */}

        <div className="mb-6 flex items-center justify-between rounded-lg border border-border bg-surface p-6">
          <div>
            <p className="font-heading text-sm font-semibold">
              Generate this month&apos;s bills
            </p>

            <p className="text-xs text-foreground-muted">
              Creates one bill per room-assigned tenant using their room&apos;s
              monthly rate. Tenants already billed this period are skipped.
            </p>
          </div>

          <form action={generateMonthlyBills}>
            <button
              type="submit"
              className="whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
            >
              Generate
            </button>
          </form>
        </div>

        {/* ======================================================
            MANUAL BILL
        ====================================================== */}

        <details className="mb-6 rounded-lg border border-border bg-surface p-6">
          <summary className="cursor-pointer font-heading text-sm font-semibold">
            Add a bill manually
          </summary>

          <form action={createBill} className="mt-4 space-y-4">
            {/* TENANT */}

            <div>
              <label htmlFor="tenantId" className={labelClass}>
                Tenant
              </label>

              <select
                id="tenantId"
                name="tenantId"
                required
                className={inputClass}
              >
                <option value="">Select a tenant…</option>

                {(tenants ?? []).map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* DATES */}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="billingPeriodStart" className={labelClass}>
                  Period start
                </label>

                <input
                  id="billingPeriodStart"
                  name="billingPeriodStart"
                  type="date"
                  required
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="billingPeriodEnd" className={labelClass}>
                  Period end
                </label>

                <input
                  id="billingPeriodEnd"
                  name="billingPeriodEnd"
                  type="date"
                  required
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="dueDate" className={labelClass}>
                  Due date
                </label>

                <input
                  id="dueDate"
                  name="dueDate"
                  type="date"
                  required
                  className={inputClass}
                />
              </div>
            </div>

            {/* AMOUNTS */}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="rentAmount" className={labelClass}>
                  Rent amount
                </label>

                <input
                  id="rentAmount"
                  name="rentAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  className={`${inputClass} font-mono`}
                />
              </div>

              <div>
                <label htmlFor="otherCharges" className={labelClass}>
                  Other charges
                </label>

                <input
                  id="otherCharges"
                  name="otherCharges"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  className={`${inputClass} font-mono`}
                />
              </div>
            </div>

            {/* SUBMIT */}

            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
            >
              Add bill
            </button>
          </form>
        </details>

        {/* ======================================================
            BILLS LIST
        ====================================================== */}

        <div className="space-y-3">
          {(bills ?? []).length === 0 && (
            <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-foreground-muted">
              No bills yet — generate this month&apos;s bills above to get
              started.
            </p>
          )}

          {(bills ?? []).map((bill) => {
            const tenant = tenantById.get(bill.tenant_id);

            const room = bill.room_id ? roomById.get(bill.room_id) : null;

            const status = displayStatus(bill);

            const remaining =
              Number(bill.total_amount ?? 0) - Number(bill.amount_paid ?? 0);

            return (
              <div
                key={bill.id}
                className="rounded-lg border border-border bg-surface p-5"
              >
                {/* HEADER */}

                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <p className="font-heading text-sm font-semibold">
                      {tenant?.full_name ?? "Unknown tenant"}
                    </p>

                    <p className="text-xs text-foreground-muted">
                      {room ? `Room ${room.room_number} · ` : ""}
                      Due {formatDate(bill.due_date)}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusStyles[status]}`}
                  >
                    {status}
                  </span>
                </div>

                {/* AMOUNT DETAILS */}

                <div className="mb-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
                  <div>
                    <p className="text-foreground-muted">Rent</p>

                    <p className="font-mono">{formatMoney(bill.rent_amount)}</p>
                  </div>

                  <div>
                    <p className="text-foreground-muted">Other charges</p>

                    <p className="font-mono">
                      {formatMoney(bill.other_charges)}
                    </p>
                  </div>

                  <div>
                    <p className="text-foreground-muted">Total</p>

                    <p className="font-mono text-accent">
                      {formatMoney(bill.total_amount)}
                    </p>
                  </div>
                </div>

                {/* PAYMENT */}

                <div className="mb-3 flex items-center justify-between rounded-md bg-surface-muted px-3 py-2 text-xs">
                  <span>Paid {formatMoney(bill.amount_paid)}</span>

                  <span
                    className={
                      remaining > 0 ? "text-status-overdue" : "text-status-paid"
                    }
                  >
                    {remaining > 0
                      ? `${formatMoney(remaining)} remaining`
                      : "Fully paid"}
                  </span>
                </div>

                {/* ACTIONS */}

                <div className="flex items-center gap-2">
                  {status !== "paid" && (
                    <form
                      action={recordPayment}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="billId" value={bill.id} />

                      <input
                        type="number"
                        name="amount"
                        min={0}
                        step="0.01"
                        required
                        placeholder="Amount"
                        className="w-28 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-primary"
                      />

                      <button
                        type="submit"
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-surface hover:opacity-90"
                      >
                        Record payment
                      </button>
                    </form>
                  )}

                  {Number(bill.amount_paid) === 0 && (
                    <form action={deleteBill}>
                      <input type="hidden" name="billId" value={bill.id} />

                      <button
                        type="submit"
                        className="rounded-md border border-status-overdue/30 px-2.5 py-1.5 text-xs text-status-overdue hover:bg-status-overdue/10"
                      >
                        Delete
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
