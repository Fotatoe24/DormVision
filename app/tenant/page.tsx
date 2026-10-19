import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantAccessState } from "@/lib/tenant-status";
import { RegistrationStatus } from "@/components/registration-status";
import { reportPayment } from "@/lib/actions";
import {
  billStatusStyles,
  formatMoney,
  formatBillDate,
  formatPaymentDate,
  displayBillStatus,
  paymentMethodLabels,
} from "@/lib/billing";
import { PaginationControls } from "@/components/pagination-controls";
import { parsePage, getRange, getTotalPages } from "@/lib/pagination";
import { BillPaymentBreakdown } from "@/components/bill-payment-breakdown";
import { Receipt } from "lucide-react";

const methodOptions: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "gcash", label: "GCash" },
  { value: "other", label: "Other" },
];

export default async function TenantPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; page?: string }>;
}) {
  const { error, saved, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role === "owner") redirect("/admin");

  // Anything short of an approved tenant record gets the
  // pending/rejected/apply screen instead of the real tenant
  // dashboard below -- the actual access-control enforcement, not
  // just a hidden button. getTenantAccessState is the single source
  // of truth for what "approved" means anywhere in the app: presence
  // of a tenants row, not the user's role alone.
  const accessState = await getTenantAccessState(
    session.user.id,
    session.profile?.dorm_id ?? null
  );

  if (accessState.status !== "approved") {
    return (
      <RegistrationStatus state={accessState} error={error} saved={saved} />
    );
  }

  const supabase = createAdminClient();

  // ---------------------------------------------------------
  // Get the tenant record
  // ---------------------------------------------------------
  const { data: me, error: tenantError } = await supabase
    .from("tenants")
    .select(
      `
      id,
      profile_id,
      full_name,
      room_id,
      dorm_id,
      emergency_contact_name,
      emergency_contact_number,
      status
      `
    )
    .eq("profile_id", session.user.id)
    .maybeSingle();

  if (tenantError) {
    console.error("Tenant lookup error:", tenantError);
  }

  // ---------------------------------------------------------
  // Get assigned room
  // IMPORTANT:
  // room_id comes from tenants.room_id
  // ---------------------------------------------------------
  const { data: room, error: roomError } = me?.room_id
    ? await supabase
        .from("rooms")
        .select("id, room_number, monthly_rate, capacity, status")
        .eq("id", me.room_id)
        .maybeSingle()
    : { data: null, error: null };

  if (roomError) {
    console.error("Room lookup error:", roomError);
  }

  // ---------------------------------------------------------
  // Get roommates
  // ---------------------------------------------------------
  const { data: roommates } = me?.room_id
    ? await supabase
        .from("tenants")
        .select("id, full_name, profile_id")
        .eq("room_id", me.room_id)
        .eq("status", "active")
        .neq("profile_id", session.user.id)
    : { data: [] };

  // ---------------------------------------------------------
  // Get bills
  //
  // IMPORTANT:
  // bills.tenant_id references tenants.id
  // NOT users.id
  // ---------------------------------------------------------
  const { from: billsFrom, to: billsTo } = getRange(page);

  const { data: bills, count: billsCount, error: billsError } = me?.id
    ? await supabase
        .from("bills")
        .select(
          `
          id,
          tenant_id,
          room_id,
          billing_period_start,
          billing_period_end,
          due_date,
          rent_amount,
          other_charges,
          charges_note,
          total_amount,
          amount_paid,
          status
          `,
          { count: "exact" }
        )
        .eq("tenant_id", me.id)
        .order("due_date", { ascending: false })
        .range(billsFrom, billsTo)
    : { data: [], count: 0, error: null };

  const billsTotalPages = getTotalPages(billsCount ?? 0);

  if (billsError) {
    console.error("Bills lookup error:", billsError);
  }

  // ---------------------------------------------------------
  // Pending payment reports -- which bills already have an
  // I've-Paid report awaiting owner review. See lib/actions.ts's
  // reportPayment/confirmPendingPayment/rejectPendingPayment and
  // migration 0011.
  // ---------------------------------------------------------
  const { data: pendingReports } = me?.id
    ? await supabase
        .from("payments")
        .select("bill_id")
        .eq("tenant_id", me.id)
        .eq("status", "pending")
    : { data: [] };

  const pendingBillIds = new Set(
    (pendingReports ?? []).map((p) => p.bill_id)
  );

  // ---------------------------------------------------------
  // Per-bill payment breakdown -- every confirmed payment that makes
  // up a given bill's amount_paid, oldest first, for the "Show payment
  // breakdown" toggle on each bill below. Scoped to just the bills on
  // this page (not every bill the tenant has ever had) since that's
  // all the toggle can ever reveal.
  // ---------------------------------------------------------
  const billIds = (bills ?? []).map((b) => b.id);

  const { data: billPayments } =
    billIds.length > 0
      ? await supabase
          .from("payments")
          .select("id, bill_id, amount, method, paid_at")
          .in("bill_id", billIds)
          .eq("status", "confirmed")
          .order("paid_at", { ascending: true })
      : { data: [] };

  type BillPaymentRow = {
    id: string;
    bill_id: string;
    amount: number;
    method: string;
    paid_at: string;
  };

  const paymentsByBillId = new Map<string, BillPaymentRow[]>();
  for (const p of (billPayments ?? []) as BillPaymentRow[]) {
    const list = paymentsByBillId.get(p.bill_id) ?? [];
    list.push(p);
    paymentsByBillId.set(p.bill_id, list);
  }

  // ---------------------------------------------------------
  // Payment history -- confirmed payments only, each with a receipt
  // (see lib/receipts.ts / app/receipts/[id]). Capped rather than
  // paginated: see the same reasoning as the utility bills list just
  // below.
  // ---------------------------------------------------------
  const { data: confirmedPayments } = me?.id
    ? await supabase
        .from("payments")
        .select("id, amount, method, paid_at")
        .eq("tenant_id", me.id)
        .eq("status", "confirmed")
        .order("paid_at", { ascending: false })
        .limit(10)
    : { data: [] };

  // ---------------------------------------------------------
  // Water & electricity bills for my room -- visible to every
  // tenant assigned to the room (not just one of them), since the
  // owner records these per room and the room's tenants split the
  // total amongst themselves. Not paginated: a room realistically
  // accumulates a handful of these, not pages of them.
  // ---------------------------------------------------------
  const { data: utilityBills } = me?.room_id
    ? await supabase
        .from("utility_bills")
        .select(
          "id, billing_period_start, billing_period_end, due_date, water_amount, electricity_amount, total_amount, amount_paid, status, notes"
        )
        .eq("room_id", me.room_id)
        .order("due_date", { ascending: false })
        .limit(12)
    : { data: [] };

  return (
    <>
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-heading text-sm font-semibold text-foreground">
            My dashboard
          </p>

          <Link
            href="/profile"
            className="text-xs font-medium text-primary hover:underline"
          >
            Edit profile
          </Link>
        </div>

        {/* Grid instead of a single stacked column -- 2 columns from
            md up (Water & electricity + My room share a row, Billing
            + Payment history share the next), 1 column on mobile.
            items-start so a taller card (Billing, which can paginate)
            doesn't stretch its shorter row-mate to match its height. */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:items-start">

        {/* Water & electricity -- shown first since this is the
            section tenants most often check first thing. */}
        {room && (utilityBills ?? []).length > 0 && (
          <div className="rounded-lg border border-border bg-surface p-6">
            <p className="mb-1 font-heading text-sm font-semibold">
              Water &amp; electricity
            </p>
            <p className="mb-4 text-xs text-foreground-muted">
              Billed to Room {room.room_number} as a whole, not split per
              tenant. Pay your dorm owner directly — split it with your
              roommates however works for you.
            </p>

            <div className="space-y-3">
              {(utilityBills ?? []).map((bill) => {
                const status = displayBillStatus(bill);
                const remaining =
                  Number(bill.total_amount) - Number(bill.amount_paid);

                return (
                  <div
                    key={bill.id}
                    className="rounded-md border border-border p-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium">
                        Due {formatBillDate(bill.due_date)}
                      </p>

                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${billStatusStyles[status]}`}
                      >
                        {status}
                      </span>
                    </div>

                    <div className="mb-2 flex items-center justify-between text-xs text-foreground-muted">
                      <span>
                        Water {formatMoney(bill.water_amount)} + Electricity{" "}
                        {formatMoney(bill.electricity_amount)}
                      </span>

                      <span className="font-mono text-accent">
                        {formatMoney(bill.total_amount)}
                      </span>
                    </div>

                    {bill.notes && (
                      <p className="mb-2 text-xs text-foreground-muted">
                        {bill.notes}
                      </p>
                    )}

                    <div className="flex items-center justify-between rounded-md bg-surface-muted px-3 py-2 text-xs">
                      <span>Paid {formatMoney(bill.amount_paid)}</span>

                      <span
                        className={
                          remaining > 0
                            ? "text-status-overdue"
                            : "text-status-paid"
                        }
                      >
                        {remaining > 0
                          ? `${formatMoney(remaining)} remaining`
                          : "Fully paid"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Room info */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-3 font-heading text-sm font-semibold">My room</p>

          {room ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm">
                  Room <span className="font-mono">{room.room_number}</span>
                </p>

                <span className="font-mono text-sm text-accent">
                  ₱{Number(room.monthly_rate).toLocaleString()}/mo
                </span>
              </div>

              {roommates && roommates.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs text-foreground-muted">
                    Roommates
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {roommates.map((r) => (
                      <span
                        key={r.id}
                        className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs"
                      >
                        {r.full_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(!roommates || roommates.length === 0) && (
                <p className="text-xs text-foreground-muted">
                  You currently have no roommates.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-foreground-muted">
              You haven&apos;t been assigned a room yet. Check with your dorm
              owner.
            </p>
          )}
        </div>

        {/* Billing */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-4 font-heading text-sm font-semibold">Billing</p>

          {(bills ?? []).length === 0 ? (
            <p className="text-sm text-foreground-muted">
              No bills yet. They&apos;ll show up here once your dorm owner
              generates one.
            </p>
          ) : (
            <div className="space-y-3">
              {(bills ?? []).map((bill) => {
                const status = displayBillStatus(bill);

                const remaining =
                  Number(bill.total_amount) - Number(bill.amount_paid);

                return (
                  <div
                    key={bill.id}
                    className="rounded-md border border-border p-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium">
                        Due {formatBillDate(bill.due_date)}
                      </p>

                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${billStatusStyles[status]}`}
                      >
                        {status}
                      </span>
                    </div>

                    <div className="mb-2 flex items-center justify-between text-xs text-foreground-muted">
                      <span>
                        Rent {formatMoney(bill.rent_amount)}
                        {Number(bill.other_charges) > 0 &&
                          ` + ${formatMoney(bill.other_charges)} other charges`}
                      </span>

                      <span className="font-mono text-accent">
                        {formatMoney(bill.total_amount)}
                      </span>
                    </div>

                    {bill.charges_note && (
                      <p className="mb-2 text-xs text-foreground-muted">
                        {bill.charges_note}
                      </p>
                    )}

                    <div className="flex items-center justify-between rounded-md bg-surface-muted px-3 py-2 text-xs">
                      <span>Paid {formatMoney(bill.amount_paid)}</span>

                      <span
                        className={
                          remaining > 0
                            ? "text-status-overdue"
                            : "text-status-paid"
                        }
                      >
                        {remaining > 0
                          ? `${formatMoney(remaining)} remaining`
                          : "Fully paid"}
                      </span>
                    </div>

                    <BillPaymentBreakdown
                      payments={paymentsByBillId.get(bill.id) ?? []}
                    />

                    {remaining > 0 && (
                      <div className="mt-2">
                        {pendingBillIds.has(bill.id) ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-status-partial/15 px-2.5 py-1 text-xs font-medium text-status-partial">
                            Payment Pending Confirmation
                          </span>
                        ) : (
                          <form
                            action={reportPayment}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <input type="hidden" name="billId" value={bill.id} />
                            <select
                              name="method"
                              defaultValue="cash"
                              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                            >
                              {methodOptions.map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-surface hover:opacity-90"
                            >
                              I&apos;ve Paid
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <PaginationControls
            page={page}
            totalPages={billsTotalPages}
            hrefForPage={(p) => (p > 1 ? `/tenant?page=${p}` : "/tenant")}
          />
        </div>

        {/* Payment history */}
        {(confirmedPayments ?? []).length > 0 && (
          <div className="rounded-lg border border-border bg-surface p-6">
            <p className="mb-4 font-heading text-sm font-semibold">
              Payment history
            </p>

            <div className="space-y-2">
              {(confirmedPayments ?? []).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-md bg-surface-muted px-3 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {formatMoney(p.amount)}
                    </p>
                    <p className="text-foreground-muted">
                      {formatPaymentDate(p.paid_at)} ·{" "}
                      {paymentMethodLabels[p.method] ?? p.method}
                    </p>
                  </div>

                  <a
                    href={`/receipts/${p.id}`}
                    className="flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    Receipt
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>
    </>
  );
}
