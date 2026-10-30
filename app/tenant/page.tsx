import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantAccessState } from "@/lib/tenant-status";
import { RegistrationStatus } from "@/components/registration-status";
import { getNotificationSettings } from "@/lib/notification-settings";
import {
  billStatusStyles,
  formatMoney,
  formatBillDate,
  formatPaymentDate,
  displayBillStatus,
  getAccountStanding,
} from "@/lib/billing";
import {
  AlertTriangle,
  BedDouble,
  Check,
  Clock,
  Pencil,
  Receipt,
  Wallet,
} from "lucide-react";

// "{Month} Rent" for a Recent Transactions row, derived from the
// underlying bill's billing period (there's no free-text description
// on a payments row) -- "Rent" alone if the bill relation didn't come
// through for some reason, rather than guessing a month.
function rentDescription(periodStart?: string | null) {
  if (!periodStart) return "Rent";
  const d = new Date(periodStart + "T00:00:00");
  return `${d.toLocaleDateString("en-PH", { month: "short" })} Rent`;
}

// "due today" / "due in 5 days" / "3 days overdue" for the payment banner.
function dueLabel(daysUntilDue: number | null) {
  if (daysUntilDue === null) return "";
  if (daysUntilDue < 0) {
    const n = Math.abs(daysUntilDue);
    return `${n} day${n === 1 ? "" : "s"} overdue`;
  }
  if (daysUntilDue === 0) return "due today";
  if (daysUntilDue === 1) return "due tomorrow";
  return `due in ${daysUntilDue} days`;
}

// Home -- just "what's going on with my room right now": water &
// electricity and room/roommates. Rent billing (the bill list,
// payment reporting, payment history) moved to its own tab, see
// app/tenant/billing/page.tsx, so this page isn't trying to be every
// tenant-facing feature at once.
export default async function TenantPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role === "owner") redirect("/admin");

  // Anything short of an approved tenant record gets the
  // pending/rejected/apply screen instead of the real tenant
  // dashboard below -- the actual access-control enforcement, not
  // just a hidden button. getTenantAccessState is the single source
  // of truth for what "approved" means anywhere in the app: presence
  // of a tenants row, not the user's role alone.
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
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(1)
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

  // ---------------------------------------------------------
  // Account standing -- a glanceable "Outstanding Balance" / "Next Due
  // Date" summary, not the full bill list (that's /tenant/billing).
  // getAccountStanding does the same derivation the Billing tab's own
  // bills implicitly rely on, so the two can never disagree about
  // what's actually owed. Capped, not paginated -- same "small-dorm
  // scale" reasoning as the utility bills query above.
  // ---------------------------------------------------------
  const { data: standingBills } = me?.id
    ? await supabase
        .from("bills")
        .select("due_date, status, total_amount, amount_paid")
        .eq("tenant_id", me.id)
        .order("due_date", { ascending: false })
        .limit(50)
    : { data: [] };

  const standing = getAccountStanding(standingBills ?? []);

  // The owner's "Payment reminders" / "Overdue notifications" toggles decide
  // whether the dashboard banner below is shown (balances stay visible in
  // the tiles either way).
  const notifications = await getNotificationSettings(me?.dorm_id);
  const showPaymentBanner =
    standing.status === "overdue"
      ? notifications.overdueNotifications
      : standing.status !== "current" && notifications.paymentReminders;

  // ---------------------------------------------------------
  // Recent transactions -- just the last 3 confirmed payments for the
  // "at a glance" card below, not the full history (that's the
  // Payment history card on /tenant/billing).
  // ---------------------------------------------------------
  const { data: recentPayments } = me?.id
    ? await supabase
        .from("payments")
        .select("id, amount, method, paid_at, bills(billing_period_start)")
        .eq("tenant_id", me.id)
        .eq("status", "confirmed")
        .order("paid_at", { ascending: false })
        .limit(3)
    : { data: [] };

  type RecentPaymentBillRel = { billing_period_start: string } | null;

  const latestPayment = (recentPayments ?? [])[0] ?? null;
  const firstName = (session.profile?.full_name ?? "there").split(" ")[0];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
            Dashboard
          </p>
          <h1 className="mt-1 font-heading text-2xl font-bold text-foreground">
            Welcome, {firstName}!
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Here&apos;s your dormitory account overview.
          </p>
        </div>

        <Link
          href="/profile"
          className="mt-1 flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit profile
        </Link>
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

      {/* What to do next: the one thing a tenant most wants from this
          page is "do I owe anything, and what do I do about it?". Online
          payment isn't supported, so the action is reporting a payment
          already made to the dorm owner (handled on the Billing tab). */}
      {showPaymentBanner ? (
        <div
          className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${
            standing.status === "overdue"
              ? "border-status-overdue/30 bg-status-overdue/10"
              : "border-status-partial/30 bg-status-partial/10"
          }`}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                standing.status === "overdue"
                  ? "bg-status-overdue/15 text-status-overdue"
                  : "bg-status-partial/15 text-status-partial"
              }`}
            >
              {standing.status === "overdue" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
            </span>

            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {standing.status === "overdue"
                  ? "Your payment is overdue"
                  : "You have a payment coming up"}
              </p>
              <p className="mt-0.5 text-xs text-foreground-muted">
                <span className="font-mono font-medium text-foreground">
                  {formatMoney(standing.balance)}
                </span>{" "}
                outstanding
                {standing.nextBill
                  ? ` · ${dueLabel(standing.daysUntilDue)} (${formatBillDate(
                      standing.nextBill.due_date
                    )})`
                  : ""}
                . Pay your dorm owner, then report it so they can confirm.
              </p>
            </div>
          </div>

          <Link
            href="/tenant/billing"
            className="shrink-0 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-surface transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Report a payment
          </Link>
        </div>
      ) : (
        standing.status === "current" &&
        (standingBills ?? []).length > 0 && (
          <div className="mb-5 flex items-center gap-3 rounded-lg border border-status-paid/30 bg-status-paid/10 px-4 py-3">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-status-paid/15 text-status-paid"
            >
              <Check className="h-4 w-4" />
            </span>
            <p className="text-sm font-medium text-foreground">
              You&apos;re all caught up — nothing is due right now.
            </p>
          </div>
        )
      )}

      {/* Account-standing tiles -- a glanceable summary; the full
          bill list and payment reporting live on the Billing tab. */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-surface-muted p-4">
          <span
            className={`mb-2 flex h-8 w-8 items-center justify-center rounded-md ${
              standing.balance > 0.004
                ? "bg-status-partial/15 text-status-partial"
                : "bg-status-paid/15 text-status-paid"
            }`}
          >
            <Wallet className="h-4 w-4" />
          </span>
          <p className="text-xs text-foreground-muted">Outstanding Balance</p>
          <p
            className={`mt-1 font-mono text-lg font-bold ${
              standing.balance > 0.004
                ? "text-status-partial"
                : "text-foreground"
            }`}
          >
            {formatMoney(standing.balance)}
          </p>
        </div>

        <div className="rounded-lg bg-surface-muted p-4">
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
            <Clock className="h-4 w-4" />
          </span>
          <p className="text-xs text-foreground-muted">Next Due Date</p>
          <p className="mt-1 text-lg font-bold text-foreground">
            {standing.nextBill
              ? formatBillDate(standing.nextBill.due_date)
              : "—"}
          </p>
        </div>

        <div className="rounded-lg bg-surface-muted p-4">
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Receipt className="h-4 w-4" />
          </span>
          <p className="text-xs text-foreground-muted">Latest Payment</p>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">
            {latestPayment ? formatMoney(latestPayment.amount) : "—"}
          </p>
          {latestPayment && (
            <span className="mt-1.5 inline-block rounded-full bg-status-paid/15 px-2 py-0.5 text-[11px] font-medium text-status-paid">
              Confirmed
            </span>
          )}
        </div>

        <div className="rounded-lg bg-surface-muted p-4">
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
            <BedDouble className="h-4 w-4" />
          </span>
          <p className="text-xs text-foreground-muted">Assigned Room</p>
          <p className="mt-1 text-lg font-bold text-foreground">
            {room ? room.room_number : "—"}
          </p>
        </div>
      </div>

      {/* Recent transactions -- short, capped list; the full history
          with receipts lives on the Billing tab's Payment history card. */}
      {(recentPayments ?? []).length > 0 && (
        <div className="mb-5 rounded-lg border border-border bg-surface p-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-heading text-sm font-semibold">
              Recent transactions
            </p>
            <Link
              href="/tenant/billing"
              className="text-xs font-medium text-primary hover:underline"
            >
              View billing
            </Link>
          </div>

          <div className="space-y-2">
            {(recentPayments ?? []).map((p) => {
              const billRel = p.bills as
                | RecentPaymentBillRel
                | RecentPaymentBillRel[];
              const bill = Array.isArray(billRel) ? billRel[0] : billRel;

              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-md bg-surface-muted px-3 py-2.5 text-sm"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {rentDescription(bill?.billing_period_start)}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {formatPaymentDate(p.paid_at)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-mono text-sm font-medium text-foreground">
                      {formatMoney(p.amount)}
                    </p>
                    <span className="mt-0.5 inline-block rounded-full bg-status-paid/15 px-2 py-0.5 text-[11px] font-medium text-status-paid">
                      Confirmed
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid instead of a single stacked column -- 2 columns from md
          up, 1 column on mobile. */}
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
      </div>
    </div>
  );
}
