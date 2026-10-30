import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Clock, FileText, Receipt } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  billStatusStyles,
  displayBillStatus,
  formatBillDate,
  formatMoney,
  formatPaymentDate,
} from "@/lib/billing";
import { EmptyState } from "@/components/empty-state";

// Billing from dorms the tenant has already moved out of. A moved-out
// tenancy is closed for the dashboard, billing and maintenance pages, but
// the person still owns that history -- so it stays viewable here,
// read-only (no payment reporting), including the invoice and receipt pages
// (lib/invoices.ts / lib/receipts.ts accept every tenancy they own).
//
// Not gated on being an approved tenant: this is exactly the page a
// moved-out tenant, or one waiting on a new dorm's approval, needs.
export default async function TenantHistoryPage() {
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role === "owner") redirect("/admin");

  const admin = createAdminClient();

  const { data: stays } = await admin
    .from("tenants")
    .select("id, dorm_id, move_in_date, move_out_date")
    .eq("profile_id", session.user.id)
    .eq("status", "moved_out")
    .order("move_out_date", { ascending: false });

  const stayRows = stays ?? [];
  const tenantIds = stayRows.map((s) => s.id);
  const dormIds = [
    ...new Set(stayRows.map((s) => s.dorm_id).filter(Boolean)),
  ] as string[];

  const [{ data: dorms }, { data: bills }, { data: payments }] = tenantIds.length
    ? await Promise.all([
        admin.from("dormitories").select("id, name").in("id", dormIds),
        admin
          .from("bills")
          .select(
            "id, tenant_id, room_id, due_date, total_amount, amount_paid, status"
          )
          .in("tenant_id", tenantIds)
          .order("due_date", { ascending: false })
          .limit(150),
        admin
          .from("payments")
          .select("id, bill_id, tenant_id, amount, paid_at")
          .in("tenant_id", tenantIds)
          .eq("status", "confirmed")
          .order("paid_at", { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  // room_id is cleared on move-out, so the room a bill was for comes from
  // the bill itself.
  const roomIds = [
    ...new Set((bills ?? []).map((b) => b.room_id).filter(Boolean)),
  ] as string[];

  const { data: rooms } = roomIds.length
    ? await admin.from("rooms").select("id, room_number").in("id", roomIds)
    : { data: [] };

  const dormName = new Map((dorms ?? []).map((d) => [d.id, d.name]));
  const roomNumber = new Map((rooms ?? []).map((r) => [r.id, r.room_number]));

  type PaymentRow = {
    id: string;
    bill_id: string;
    tenant_id: string;
    amount: number;
    paid_at: string;
  };

  const paymentsByBill = new Map<string, PaymentRow[]>();
  for (const p of (payments ?? []) as PaymentRow[]) {
    const list = paymentsByBill.get(p.bill_id) ?? [];
    list.push(p);
    paymentsByBill.set(p.bill_id, list);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/tenant"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </Link>

      <div className="mb-6">
        <h1 className="font-heading text-lg font-semibold text-primary">
          Past stays
        </h1>
        <p className="text-xs text-foreground-muted">
          Billing, invoices and receipts from dormitories you&apos;ve moved
          out of. This is a record only.
        </p>
      </div>

      {stayRows.length === 0 ? (
        <EmptyState
          bordered
          icon={Clock}
          title="No past stays"
          description="When you move out of a dormitory, its billing history will be kept here for you."
        />
      ) : (
        <div className="space-y-5">
          {stayRows.map((stay) => {
            const stayBills = (bills ?? []).filter(
              (b) => b.tenant_id === stay.id
            );

            return (
              <section
                key={stay.id}
                className="rounded-lg border border-border bg-surface p-5"
              >
                <div className="mb-4">
                  <p className="font-heading text-sm font-semibold">
                    {(stay.dorm_id && dormName.get(stay.dorm_id)) ||
                      "Former dormitory"}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {formatBillDate(stay.move_in_date)}
                    {stay.move_out_date
                      ? ` – ${formatBillDate(stay.move_out_date)}`
                      : ""}
                  </p>
                </div>

                {stayBills.length === 0 ? (
                  <p className="text-sm text-foreground-muted">
                    No bills were recorded for this stay.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {stayBills.map((bill) => {
                      const status = displayBillStatus(bill);
                      const remaining =
                        Number(bill.total_amount) - Number(bill.amount_paid);
                      const billPayments = paymentsByBill.get(bill.id) ?? [];

                      return (
                        <div
                          key={bill.id}
                          className="rounded-md border border-border p-4"
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">
                              Due {formatBillDate(bill.due_date)}
                              {bill.room_id && roomNumber.get(bill.room_id)
                                ? ` · Room ${roomNumber.get(bill.room_id)}`
                                : ""}
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

                          <div className="flex items-center justify-between rounded-md bg-surface-muted px-3 py-2 text-xs">
                            <span>
                              Paid {formatMoney(bill.amount_paid)} of{" "}
                              <span className="font-mono">
                                {formatMoney(bill.total_amount)}
                              </span>
                            </span>

                            <span
                              className={
                                remaining > 0
                                  ? "text-status-overdue"
                                  : "text-status-paid"
                              }
                            >
                              {remaining > 0
                                ? `${formatMoney(remaining)} unpaid`
                                : "Fully paid"}
                            </span>
                          </div>

                          {billPayments.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {billPayments.map((p) => (
                                <li
                                  key={p.id}
                                  className="flex items-center justify-between text-xs text-foreground-muted"
                                >
                                  <span>
                                    {formatPaymentDate(p.paid_at)} ·{" "}
                                    <span className="font-mono">
                                      {formatMoney(p.amount)}
                                    </span>
                                  </span>

                                  <Link
                                    href={`/receipts/${p.id}`}
                                    className="flex items-center gap-1 font-medium text-primary hover:underline"
                                  >
                                    <Receipt className="h-3 w-3" />
                                    Receipt
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
