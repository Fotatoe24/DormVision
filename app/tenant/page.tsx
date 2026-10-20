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
  displayBillStatus,
} from "@/lib/billing";

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
