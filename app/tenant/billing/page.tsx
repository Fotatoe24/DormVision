import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantAccessState } from "@/lib/tenant-status";
import { RegistrationStatus } from "@/components/registration-status";
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
import { PaymentReportForm } from "@/components/payment-report-form";
import { ProofViewer } from "@/components/proof-viewer";
import { signProofUrls } from "@/lib/payment-proofs";
import { Receipt, FileText } from "lucide-react";

// Split out of app/tenant/page.tsx -- that page (Home) now covers
// just "what's going on with my room right now" (water & electricity,
// roommates), while rent billing -- the bill list, payment reporting,
// and payment history -- lives here as its own tab so Home isn't
// trying to be every tenant-facing feature at once.
export default async function TenantBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; page?: string }>;
}) {
  const { error, saved, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role === "owner") redirect("/admin");

  // Same access gate as Home -- a tenant whose registration isn't
  // approved yet (or was rejected) sees the same pending/rejected
  // screen here as anywhere else in the tenant app, rather than an
  // empty or broken billing page.
  const accessState = await getTenantAccessState(session.user.id);

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
    .select("id, profile_id")
    .eq("profile_id", session.user.id)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tenantError) {
    console.error("Tenant lookup error:", tenantError);
  }

  // Dorms they've already moved out of -- their billing stays viewable.
  const { count: pastStaysCount } = await supabase
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", session.user.id)
    .eq("status", "moved_out");

  // ---------------------------------------------------------
  // Get bills
  //
  // IMPORTANT:
  // bills.tenant_id references tenants.id
  // NOT users.id
  // ---------------------------------------------------------
  const { from: billsFrom, to: billsTo } = getRange(page);

  const {
    data: bills,
    count: billsCount,
    error: billsError,
  } = me?.id
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
        .select("bill_id, proof_path")
        .eq("tenant_id", me.id)
        .eq("status", "pending")
    : { data: [] };

  const pendingBillIds = new Set((pendingReports ?? []).map((p) => p.bill_id));

  // The tenant's own proof for a pending report (a signed, expiring link).
  const proofUrls = await signProofUrls(
    (pendingReports ?? []).map((p) => p.proof_path)
  );
  const pendingProofByBill = new Map(
    (pendingReports ?? [])
      .filter((p) => p.proof_path && proofUrls.get(p.proof_path))
      .map((p) => [p.bill_id, proofUrls.get(p.proof_path!)!])
  );

  // ---------------------------------------------------------
  // Per-bill payment breakdown -- every confirmed payment that makes
  // up a given bill's amount_paid, oldest first, for the "Show payment
  // breakdown" toggle on each bill below. Scoped to just the bills on
  // this page (not every bill the tenant has ever had) since that's
  // all the toggle can ever reveal.
  // ---------------------------------------------------------
  const billIds = (bills ?? []).map((b) => b.id);

  // Why the owner turned a payment report down, per bill (newest first), so
  // the tenant knows what to fix before reporting again.
  const { data: rejectedReports } =
    me?.id && billIds.length > 0
      ? await supabase
          .from("payments")
          .select("bill_id, review_note")
          .eq("tenant_id", me.id)
          .eq("status", "rejected")
          .in("bill_id", billIds)
          .order("reviewed_at", { ascending: false })
      : { data: [] };

  const rejectionNoteByBill = new Map<string, string | null>();
  for (const r of rejectedReports ?? []) {
    if (!rejectionNoteByBill.has(r.bill_id)) {
      rejectionNoteByBill.set(r.bill_id, r.review_note);
    }
  }

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
  // paginated: see the same reasoning as the utility bills list on
  // the Home tab.
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

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="font-heading text-sm font-semibold text-foreground">
          Billing
        </p>

        {(pastStaysCount ?? 0) > 0 && (
          <Link
            href="/tenant/history"
            className="text-xs font-medium text-primary hover:underline"
          >
            Past stays
          </Link>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-status-overdue/30 bg-status-overdue/10 px-3 py-2 text-xs text-status-overdue">
          {error}
        </div>
      )}
      {saved && (
        <div className="mb-4 rounded-md border border-status-paid/30 bg-status-paid/10 px-3 py-2 text-xs text-status-paid">
          {saved}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:items-start">
        {/* Bills */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-4 font-heading text-sm font-semibold">Rent bills</p>

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

                      <div className="flex items-center gap-2">
                        <Link
                          href={`/invoices/${bill.id}`}
                          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <FileText className="h-3 w-3" />
                          Invoice
                        </Link>

                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${billStatusStyles[status]}`}
                        >
                          {status}
                        </span>
                      </div>
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
                          <div className="flex flex-wrap items-center gap-3">
                            {pendingProofByBill.get(bill.id) && (
                              <ProofViewer
                                url={pendingProofByBill.get(bill.id)!}
                                label="Your payment proof"
                              />
                            )}
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-status-partial/15 px-2.5 py-1 text-xs font-medium text-status-partial">
                              Payment Pending Confirmation
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {rejectionNoteByBill.has(bill.id) && (
                              <p
                                role="status"
                                className="rounded-md border border-status-overdue/30 bg-status-overdue/10 px-3 py-2 text-xs text-status-overdue"
                              >
                                Your last payment report wasn&apos;t accepted
                                {rejectionNoteByBill.get(bill.id)
                                  ? `: ${rejectionNoteByBill.get(bill.id)}`
                                  : "."}
                              </p>
                            )}
                            <PaymentReportForm billId={bill.id} />
                          </div>
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
            hrefForPage={(p) =>
              p > 1 ? `/tenant/billing?page=${p}` : "/tenant/billing"
            }
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
  );
}
