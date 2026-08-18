import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantAccessState } from "@/lib/tenant-status";
import { RegistrationStatus } from "@/components/registration-status";
import {
  getAccountStanding,
  billStatusStyles,
  formatMoney,
  formatBillDate,
  displayBillStatus,
} from "@/lib/billing";
import { AccountStandingBadge } from "@/components/tenant/account-standing-badge";
import { BalanceCard } from "@/components/tenant/balance-card";
import { NextPaymentCard } from "@/components/tenant/next-payment-card";
import { AccommodationCard } from "@/components/tenant/accommodation-card";
import { RecentPayments } from "@/components/tenant/recent-payments";

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 rounded-lg border border-status-overdue/30 bg-status-overdue/10 px-4 py-3 text-sm text-status-overdue">
      {children}
    </div>
  );
}

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
      move_in_date,
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
  // Get the dormitory (for greeting context + Pay Now contact info)
  // ---------------------------------------------------------
  const { data: dorm } = session.profile?.dorm_id
    ? await supabase
        .from("dormitories")
        .select("name, contact_number, email")
        .eq("id", session.profile.dorm_id)
        .maybeSingle()
    : { data: null };

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
  const { data: bills, error: billsError } = me?.id
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
          `
        )
        .eq("tenant_id", me.id)
        .order("due_date", { ascending: false })
    : { data: [], error: null };

  if (billsError) {
    console.error("Bills lookup error:", billsError);
  }

  // ---------------------------------------------------------
  // Get recent payments
  //
  // payments.tenant_id also references tenants.id, same as bills.
  // ---------------------------------------------------------
  const { data: payments, error: paymentsError } = me?.id
    ? await supabase
        .from("payments")
        .select("id, amount, method, paid_at")
        .eq("tenant_id", me.id)
        .order("paid_at", { ascending: false })
        .limit(5)
    : { data: [], error: null };

  if (paymentsError) {
    console.error("Payments lookup error:", paymentsError);
  }

  const standing = getAccountStanding(bills ?? []);
  const firstName = (session.profile?.full_name ?? "").split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-lg font-semibold text-foreground">
            {greeting}, {firstName} 👋
          </h1>
          <p className="text-xs text-foreground-muted">
            Here&apos;s your account overview.
          </p>
        </div>

        <Link
          href="/profile"
          className="whitespace-nowrap text-xs font-medium text-primary hover:underline"
        >
          Edit profile
        </Link>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {(tenantError || roomError) && (
        <ErrorBanner>
          We couldn&apos;t load part of your account information. Try refreshing
          the page.
        </ErrorBanner>
      )}

      {/* Balance + status */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <BalanceCard
          standing={standing}
          dormName={dorm?.name}
          contactNumber={dorm?.contact_number}
          contactEmail={dorm?.email}
        />

        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-3 text-xs font-medium text-foreground-muted">
            Payment status
          </p>
          <AccountStandingBadge status={standing.status} />
        </div>
      </div>

      {/* Accommodation + next payment */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AccommodationCard
          dormName={dorm?.name}
          room={room}
          roommates={roommates ?? []}
          moveInDate={me?.move_in_date}
        />
        <NextPaymentCard standing={standing} />
      </div>

      {/* Recent payments */}
      {paymentsError ? (
        <div className="mb-6 rounded-lg border border-border bg-surface p-6">
          <p className="mb-2 font-heading text-sm font-semibold">
            Recent payments
          </p>
          <p className="mb-3 text-sm text-foreground-muted">
            We couldn&apos;t load your payment history. Please try again.
          </p>
        </div>
      ) : (
        <div className="mb-6">
          <RecentPayments payments={payments ?? []} />
        </div>
      )}

      {/* Full billing history — same underlying data as the balance
          summary above, kept as the detailed record a tenant can dig
          into (charges breakdown, notes, per-bill status). */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <p className="font-heading text-sm font-semibold">Billing history</p>
        </div>

        {billsError ? (
          <div className="px-6 py-6 text-sm text-foreground-muted">
            We couldn&apos;t load your billing information. Please try again.
          </div>
        ) : (bills ?? []).length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm font-medium text-foreground">No bills yet.</p>
            <p className="mt-1 text-xs text-foreground-muted">
              They&apos;ll show up here once your dorm owner generates one.
            </p>
          </div>
        ) : (
          <div className="space-y-3 p-6">
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
