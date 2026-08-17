import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney, displayBillStatus, formatPaymentDate } from "@/lib/billing";

type TenantRow = {
  id: string;
  room_id: string | null;
  status: string;
};

type BillRow = {
  id: string;
  status: string;
  due_date: string;
  total_amount: number | string;
  amount_paid: number | string;
};

const billStatusLabels: Record<string, string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
  overdue: "Overdue",
};

const billStatusDotColors: Record<string, string> = {
  paid: "bg-status-paid",
  partial: "bg-status-partial",
  unpaid: "bg-status-unpaid",
  overdue: "bg-status-overdue",
};

const roomStatusLabels: Record<string, string> = {
  available: "Available",
  full: "Full",
  maintenance: "Under maintenance",
};

export default async function AdminPage() {
  const session = await getSessionUser();

  if (!session) {
    redirect("/");
  }

  if (session.profile?.role !== "owner") {
    redirect("/tenant");
  }

  const dormId = session.profile?.dorm_id;

  if (!dormId) {
    redirect("/");
  }

  const supabase = createAdminClient();

  const [{ data: dorm }, { data: rooms }, { data: tenants }, { data: bills }] =
    await Promise.all([
      supabase
        .from("dormitories")
        .select("id, name, join_code")
        .eq("id", dormId)
        .single(),
      supabase
        .from("rooms")
        .select("id, room_number, capacity, status")
        .eq("dorm_id", dormId),
      supabase
        .from("tenants")
        .select("id, room_id, status")
        .eq("dorm_id", dormId),
      supabase
        .from("bills")
        .select("id, status, due_date, total_amount, amount_paid")
        .eq("dorm_id", dormId),
    ]);

  const tenantIds = ((tenants as TenantRow[] | null) ?? []).map((t) => t.id);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [{ data: recentPayments }, { data: monthPayments }] = tenantIds.length
    ? await Promise.all([
        supabase
          .from("payments")
          .select("id, amount, paid_at, tenants(full_name)")
          .in("tenant_id", tenantIds)
          .order("paid_at", { ascending: false })
          .limit(5),
        supabase
          .from("payments")
          .select("amount")
          .in("tenant_id", tenantIds)
          .gte("paid_at", startOfMonth.toISOString()),
      ])
    : [{ data: [] }, { data: [] }];

  // ------------------------------------------------------------
  // Derived stats — every number below comes straight from the
  // queries above; nothing here is fabricated or estimated.
  // ------------------------------------------------------------

  const totalBeds = (rooms ?? []).reduce((sum, r) => sum + r.capacity, 0);
  const occupiedBeds = ((tenants as TenantRow[] | null) ?? []).filter(
    (t) => t.status === "active" && t.room_id
  ).length;

  const collectedThisMonth = (monthPayments ?? []).reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );

  const billsWithStatus = ((bills as BillRow[] | null) ?? []).map((b) => ({
    ...b,
    displayStatus: displayBillStatus(b),
  }));

  const outstandingTotal = billsWithStatus
    .filter((b) => b.displayStatus !== "paid")
    .reduce(
      (sum, b) => sum + (Number(b.total_amount) - Number(b.amount_paid)),
      0
    );

  const statusCounts = {
    paid: 0,
    partial: 0,
    unpaid: 0,
    overdue: 0,
  } as Record<string, number>;

  for (const bill of billsWithStatus) {
    statusCounts[bill.displayStatus] =
      (statusCounts[bill.displayStatus] ?? 0) + 1;
  }

  const maintenanceRooms = (rooms ?? []).filter(
    (r) => r.status === "maintenance"
  );

  const ownerFirstName =
    (session.profile?.full_name ?? "").split(" ")[0] || "there";

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-lg font-semibold text-primary">
          Good morning, {ownerFirstName}
        </h1>
        <p className="text-xs text-foreground-muted">
          Here&apos;s what&apos;s happening with{" "}
          {dorm?.name ?? "your dormitory"}.
        </p>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-foreground-muted">Occupancy</p>
          <p className="mt-1 font-heading text-xl font-semibold text-foreground">
            {occupiedBeds}
            <span className="text-sm font-normal text-foreground-muted">
              /{totalBeds}
            </span>
          </p>
          <p className="text-[11px] text-foreground-muted">beds occupied</p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-foreground-muted">Collected this month</p>
          <p className="mt-1 font-mono text-xl font-semibold text-status-paid">
            {formatMoney(collectedThisMonth)}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-foreground-muted">Outstanding</p>
          <p
            className={`mt-1 font-mono text-xl font-semibold ${
              outstandingTotal > 0 ? "text-status-overdue" : "text-foreground"
            }`}
          >
            {formatMoney(outstandingTotal)}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-foreground-muted">Overdue bills</p>
          <p
            className={`mt-1 font-heading text-xl font-semibold ${
              statusCounts.overdue > 0
                ? "text-status-overdue"
                : "text-foreground"
            }`}
          >
            {statusCounts.overdue}
          </p>
        </div>
      </div>

      {/* Payment status breakdown */}
      {billsWithStatus.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3">
          {(["paid", "partial", "unpaid", "overdue"] as const).map((status) => (
            <div key={status} className="flex items-center gap-1.5 text-xs">
              <span
                className={`inline-block h-2 w-2 rounded-full ${billStatusDotColors[status]}`}
              />
              <span className="text-foreground-muted">
                {billStatusLabels[status]}
              </span>
              <span className="font-mono font-medium text-foreground">
                {statusCounts[status] ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Recent payments */}
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-heading font-semibold">
            Recent payments
          </div>
          {recentPayments && recentPayments.length > 0 ? (
            <div>
              {recentPayments.map((p, i) => {
                const tenantRel = p.tenants as
                  | { full_name: string }
                  | { full_name: string }[]
                  | null;
                const tenantName = Array.isArray(tenantRel)
                  ? tenantRel[0]?.full_name
                  : tenantRel?.full_name;

                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between px-4 py-3 ${
                      i < recentPayments.length - 1
                        ? "border-b border-border"
                        : ""
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {tenantName ?? "Unknown tenant"}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {formatPaymentDate(p.paid_at)}
                      </p>
                    </div>
                    <span className="font-mono text-sm text-status-paid">
                      {formatMoney(p.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-foreground-muted">
              No payments recorded yet.
            </p>
          )}
        </div>

        {/* Rooms needing attention */}
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-heading font-semibold">
            Rooms needing attention
          </div>
          {maintenanceRooms.length > 0 ? (
            <div>
              {maintenanceRooms.map((r, i) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between px-4 py-3 ${
                    i < maintenanceRooms.length - 1
                      ? "border-b border-border"
                      : ""
                  }`}
                >
                  <p className="text-sm font-medium">Room {r.room_number}</p>
                  <span className="rounded-full bg-status-partial/15 px-2.5 py-0.5 text-xs font-medium text-status-partial">
                    {roomStatusLabels[r.status] ?? r.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-foreground-muted">
              Nothing needs attention right now.
            </p>
          )}
        </div>
      </div>

      {/* Share dorm ID */}
      <div className="rounded-lg border border-border bg-surface p-6">
        <p className="font-heading text-sm font-semibold mb-1">
          {dorm?.name ?? "Your dormitory"}
        </p>
        <p className="mb-3 text-sm text-foreground-muted">
          Share this Dorm ID so tenants can sign themselves up.
        </p>
        <div className="inline-flex items-center gap-2 rounded-md bg-surface-muted px-3 py-2">
          <span className="font-mono text-sm tracking-wider text-accent">
            {dorm?.join_code ?? "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
