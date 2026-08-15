import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
  if (session.profile?.role !== "owner") redirect("/tenant");

  const dormId = session.profile.dorm_id;
  const supabase = await createClient();

  const { data: bills } = await supabase
    .from("bills")
    .select(
      "id, tenant_id, room_id, billing_period_start, due_date, rent_amount, other_charges, charges_note, total_amount, amount_paid, status"
    )
    .eq("dorm_id", dormId)
    .order("due_date", { ascending: false });

  const { data: tenants } = await supabase
    .from("users")
    .select("id, full_name, room_id")
    .eq("dorm_id", dormId)
    .eq("role", "tenant")
    .order("full_name");

  const { data: rooms } = await supabase
    .from("rooms")
    .select("id, room_number")
    .eq("dorm_id", dormId);

  const tenantById = new Map((tenants ?? []).map((t) => [t.id, t]));
  const roomById = new Map((rooms ?? []).map((r) => [r.id, r]));

  const outstandingCount = (bills ?? []).filter(
    (b) => displayStatus(b) !== "paid"
  ).length;

  return (
    <main className="flex-1 bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-3xl">
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

        {/* Generate this month's bills */}
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

        {/* Manual bill creation */}
        <details className="mb-6 rounded-lg border border-border bg-surface p-6">
          <summary className="cursor-pointer font-heading text-sm font-semibold">
            Add a bill manually
          </summary>
          <form action={createBill} className="mt-4 space-y-4">
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
                {(tenants ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
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

            <div>
              <label htmlFor="chargesNote" className={labelClass}>
                Charges note (optional)
              </label>
              <input
                id="chargesNote"
                name="chargesNote"
                type="text"
                placeholder="e.g. water bill, key deposit"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
            >
              Add bill
            </button>
          </form>
        </details>

        {/* Bills list */}
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
              Number(bill.total_amount) - Number(bill.amount_paid);

            return (
              <div
                key={bill.id}
                className="rounded-lg border border-border bg-surface p-5"
              >
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

                <div className="mb-3 grid grid-cols-3 gap-3 text-xs">
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

                {bill.charges_note && (
                  <p className="mb-3 text-xs text-foreground-muted">
                    {bill.charges_note}
                  </p>
                )}

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
