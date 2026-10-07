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
  displayBillStatus,
} from "@/lib/billing";
import { PaginationControls } from "@/components/pagination-controls";
import { parsePage, getRange, getTotalPages } from "@/lib/pagination";

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

  return (
    <>
      <div className="mx-auto max-w-2xl">
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

        {/* Room info */}
        <div className="mb-6 rounded-lg border border-border bg-surface p-6">
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
        <div className="mb-6 rounded-lg border border-border bg-surface p-6">
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
      </div>
    </>
  );
}
