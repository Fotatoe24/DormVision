import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateTenantProfile, logout } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";
import {
  billStatusStyles,
  formatMoney,
  formatBillDate,
  displayBillStatus,
} from "@/lib/billing";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";
const labelClass = "mb-1.5 block text-xs font-medium text-foreground-muted";
export default async function TenantPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;

  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role === "owner") redirect("/admin");

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
  // Get the user's profile information
  // email and phone are stored in public.users
  // ---------------------------------------------------------
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, full_name, email, phone")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Profile lookup error:", profileError);
  }

  // ---------------------------------------------------------
  // Get dormitory
  // ---------------------------------------------------------
  const { data: dorm } = me?.dorm_id
    ? await supabase
        .from("dormitories")
        .select("id, name")
        .eq("id", me.dorm_id)
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

  return (
    <main className="flex-1 bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-2xl">
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
