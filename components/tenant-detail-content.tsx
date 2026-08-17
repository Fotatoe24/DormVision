import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeTenantFromRoom, transferTenant } from "@/lib/actions";
import {
  formatMoney,
  formatBillDate,
  formatPaymentDate,
  displayBillStatus,
  billStatusStyles,
} from "@/lib/billing";

export const tenantStatusStyles: Record<string, string> = {
  active: "bg-status-paid/15 text-status-paid",
  inactive: "bg-status-unpaid/15 text-status-unpaid",
  moved_out: "bg-status-unpaid/15 text-status-unpaid",
};

export const tenantStatusLabels: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  moved_out: "Moved out",
};

// Shared by both the full tenant detail page (app/admin/tenants/[id])
// and its intercepted-route modal (app/admin/@modal/(.)tenants/[id]) so
// the query logic and markup only live in one place. The caller owns
// the surrounding chrome (page layout vs. dialog shell).
export async function TenantDetailContent({
  id,
  dormId,
  error,
  saved,
}: {
  id: string;
  dormId: string;
  error?: string;
  saved?: string;
}) {
  const supabase = createAdminClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select(
      "id, profile_id, full_name, contact_number, emergency_contact_name, emergency_contact_number, move_in_date, move_out_date, status, room_id"
    )
    .eq("id", id)
    .eq("dorm_id", dormId)
    .maybeSingle();

  if (!tenant) {
    notFound();
  }

  const [
    { data: profile },
    { data: room },
    { data: bills },
    { data: payments },
    { data: assignmentHistory },
    { data: dormRooms },
    { data: dormTenants },
  ] = await Promise.all([
    tenant.profile_id
      ? supabase
          .from("users")
          .select("email")
          .eq("id", tenant.profile_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    tenant.room_id
      ? supabase
          .from("rooms")
          .select("id, room_number, monthly_rate")
          .eq("id", tenant.room_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("bills")
      .select("id, status, due_date, total_amount, amount_paid")
      .eq("tenant_id", tenant.id)
      .order("due_date", { ascending: false }),
    supabase
      .from("payments")
      .select("id, amount, paid_at, method")
      .eq("tenant_id", tenant.id)
      .order("paid_at", { ascending: false }),
    supabase
      .from("room_assignments")
      .select("id, started_at, ended_at, rooms(room_number)")
      .eq("tenant_id", tenant.id)
      .order("started_at", { ascending: false }),
    supabase
      .from("rooms")
      .select("id, room_number, capacity, status")
      .eq("dorm_id", dormId)
      .in("status", ["available", "full"])
      .order("room_number"),
    supabase
      .from("tenants")
      .select("room_id")
      .eq("dorm_id", dormId)
      .eq("status", "active"),
  ]);

  const balance = (bills ?? []).reduce((sum, bill) => {
    const displayStatus = displayBillStatus(bill);
    if (displayStatus === "paid") return sum;
    return sum + (Number(bill.total_amount) - Number(bill.amount_paid));
  }, 0);

  const occupancyByRoom = new Map<string, number>();
  for (const t of dormTenants ?? []) {
    if (t.room_id) {
      occupancyByRoom.set(t.room_id, (occupancyByRoom.get(t.room_id) ?? 0) + 1);
    }
  }

  const transferableRooms = (dormRooms ?? []).filter(
    (r) =>
      r.id !== tenant.room_id &&
      (occupancyByRoom.get(r.id) ?? 0) < r.capacity
  );

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-foreground-muted">Tenant</p>
          <h1 className="truncate font-heading text-lg font-semibold text-primary">
            {tenant.full_name}
          </h1>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            tenantStatusStyles[tenant.status] ?? ""
          }`}
        >
          {tenantStatusLabels[tenant.status] ?? tenant.status}
        </span>
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

      {/* Balance */}
      <div className="mb-5 rounded-lg border border-border bg-surface p-5">
        <p className="text-xs text-foreground-muted">Current balance</p>
        <p
          className={`mt-1 font-mono text-2xl font-semibold ${
            balance > 0 ? "text-status-overdue" : "text-status-paid"
          }`}
        >
          {formatMoney(balance)}
        </p>
      </div>

      {/* Contact */}
      <div className="mb-5 space-y-3 rounded-lg border border-border bg-surface p-5">
        <p className="font-heading text-sm font-semibold">Contact</p>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-foreground-muted">Email</p>
            <p>{profile?.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-foreground-muted">Phone</p>
            <p>{tenant.contact_number ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-foreground-muted">Emergency contact</p>
            <p>{tenant.emergency_contact_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-foreground-muted">Emergency number</p>
            <p>{tenant.emergency_contact_number ?? "—"}</p>
          </div>
        </div>
      </div>

      {/* Room */}
      <div className="mb-5 rounded-lg border border-border bg-surface p-5">
        <p className="mb-3 font-heading text-sm font-semibold">Room</p>
        {room ? (
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm">
                  Room <span className="font-mono">{room.room_number}</span>
                </p>
                <p className="text-xs text-foreground-muted">
                  Moved in {formatBillDate(tenant.move_in_date)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-sm text-accent">
                  {formatMoney(room.monthly_rate)}/mo
                </span>
                {tenant.profile_id && (
                  <form action={removeTenantFromRoom}>
                    <input
                      type="hidden"
                      name="tenantId"
                      value={tenant.profile_id}
                    />
                    <input type="hidden" name="roomId" value={room.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-status-overdue/30 px-2.5 py-1 text-xs text-status-overdue hover:bg-status-overdue/10"
                    >
                      Remove from room
                    </button>
                  </form>
                )}
              </div>
            </div>

            {tenant.profile_id && transferableRooms.length > 0 && (
              <form
                action={transferTenant}
                className="flex items-center gap-2 border-t border-border pt-3"
              >
                <input
                  type="hidden"
                  name="tenantId"
                  value={tenant.profile_id}
                />
                <select
                  name="newRoomId"
                  required
                  defaultValue=""
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                >
                  <option value="" disabled>
                    Transfer to…
                  </option>
                  {transferableRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.room_number}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground-muted hover:text-foreground"
                >
                  Transfer
                </button>
              </form>
            )}
          </div>
        ) : (
          <p className="text-sm text-foreground-muted">
            Not currently assigned to a room.{" "}
            <Link href="/admin/rooms" className="text-primary hover:underline">
              Assign a room
            </Link>
          </p>
        )}
      </div>

      {/* Assignment history */}
      <div className="mb-5 rounded-lg border border-border bg-surface overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-heading font-semibold">
          Assignment history
        </div>
        {assignmentHistory && assignmentHistory.length > 0 ? (
          <div>
            {assignmentHistory.map((a, i) => {
              const roomRel = a.rooms as
                | { room_number: string }
                | { room_number: string }[]
                | null;
              const roomNumber = Array.isArray(roomRel)
                ? roomRel[0]?.room_number
                : roomRel?.room_number;

              return (
                <div
                  key={a.id}
                  className={`flex items-center justify-between px-4 py-3 text-sm ${
                    i < assignmentHistory.length - 1
                      ? "border-b border-border"
                      : ""
                  }`}
                >
                  <span>Room {roomNumber ?? "—"}</span>
                  <span className="text-xs text-foreground-muted">
                    {formatBillDate(a.started_at)} –{" "}
                    {a.ended_at ? formatBillDate(a.ended_at) : "Present"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-foreground-muted">
            No recorded room history yet.
          </p>
        )}
      </div>

      {/* Billing history */}
      <div className="mb-5 rounded-lg border border-border bg-surface overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-heading font-semibold">
          Billing history
        </div>
        {bills && bills.length > 0 ? (
          <div>
            {bills.map((bill, i) => {
              const displayStatus = displayBillStatus(bill);
              return (
                <div
                  key={bill.id}
                  className={`flex items-center justify-between px-4 py-3 ${
                    i < bills.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">
                      Due {formatBillDate(bill.due_date)}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      Paid {formatMoney(bill.amount_paid)} of{" "}
                      {formatMoney(bill.total_amount)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${billStatusStyles[displayStatus]}`}
                  >
                    {displayStatus}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-foreground-muted">
            No bills yet.
          </p>
        )}
      </div>

      {/* Payment history */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-heading font-semibold">
          Payment history
        </div>
        {payments && payments.length > 0 ? (
          <div>
            {payments.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center justify-between px-4 py-3 ${
                  i < payments.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div>
                  <p className="text-sm font-medium">
                    {formatPaymentDate(p.paid_at)}
                  </p>
                  <p className="text-xs capitalize text-foreground-muted">
                    {p.method.replace("_", " ")}
                  </p>
                </div>
                <span className="font-mono text-sm text-status-paid">
                  {formatMoney(p.amount)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-foreground-muted">
            No payments recorded yet.
          </p>
        )}
      </div>
    </>
  );
}
