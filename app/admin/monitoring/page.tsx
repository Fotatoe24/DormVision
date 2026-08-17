import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney, displayBillStatus } from "@/lib/billing";

type RoomRow = { id: string; capacity: number; status: string };
type TenantRow = {
  id: string;
  room_id: string | null;
  status: string;
  move_in_date: string;
  move_out_date: string | null;
};
type BillRow = {
  id: string;
  status: string;
  due_date: string;
  billing_period_start: string;
  total_amount: number | string;
  amount_paid: number | string;
};

const roomStatusLabels: Record<string, string> = {
  available: "Available",
  full: "Full",
  maintenance: "Under maintenance",
};

const roomStatusColors: Record<string, string> = {
  available: "bg-status-paid",
  full: "bg-status-unpaid",
  maintenance: "bg-status-partial",
};

const billStatusLabels: Record<string, string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
  overdue: "Overdue",
};

const billStatusColors: Record<string, string> = {
  paid: "bg-status-paid",
  partial: "bg-status-partial",
  unpaid: "bg-status-unpaid",
  overdue: "bg-status-overdue",
};

function monthLabel(d: Date) {
  return d.toLocaleDateString("en-PH", { month: "short", year: "2-digit" });
}

// Simple horizontal bar row — used for every chart on this page instead
// of pulling in a charting library, matching the app's existing
// hand-rolled-component style. `fraction` is clamped to [0, 1].
function BarRow({
  label,
  value,
  fraction,
  colorClass,
}: {
  label: string;
  value: string;
  fraction: number;
  colorClass: string;
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-foreground-muted">
        {label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-24 shrink-0 text-right font-mono text-xs text-foreground-muted">
        {value}
      </span>
    </div>
  );
}

export default async function MonitoringPage() {
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role !== "owner") redirect("/tenant");

  const dormId = session.profile?.dorm_id;
  if (!dormId) redirect("/");

  const supabase = createAdminClient();

  const [{ data: rooms, error: roomsError }, { data: tenants, error: tenantsError }, { data: bills, error: billsError }] =
    await Promise.all([
      supabase
        .from("rooms")
        .select("id, capacity, status")
        .eq("dorm_id", dormId),
      supabase
        .from("tenants")
        .select("id, room_id, status, move_in_date, move_out_date")
        .eq("dorm_id", dormId),
      supabase
        .from("bills")
        .select("id, status, due_date, billing_period_start, total_amount, amount_paid")
        .eq("dorm_id", dormId),
    ]);

  const loadError = roomsError?.message || tenantsError?.message || billsError?.message || null;

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-lg border border-status-overdue/30 bg-status-overdue/10 px-4 py-3 text-sm text-status-overdue">
          Could not load monitoring data: {loadError}
        </div>
      </div>
    );
  }

  const roomRows = (rooms ?? []) as RoomRow[];
  const tenantRows = (tenants ?? []) as TenantRow[];
  const billRows = (bills ?? []) as BillRow[];

  // ------------------------------------------------------------
  // Current snapshot: room status breakdown
  // ------------------------------------------------------------
  const roomStatusCounts: Record<string, number> = {
    available: 0,
    full: 0,
    maintenance: 0,
  };
  for (const r of roomRows) {
    roomStatusCounts[r.status] = (roomStatusCounts[r.status] ?? 0) + 1;
  }

  // ------------------------------------------------------------
  // Current snapshot: bill status breakdown
  // ------------------------------------------------------------
  const billStatusCounts: Record<string, number> = {
    paid: 0,
    partial: 0,
    unpaid: 0,
    overdue: 0,
  };
  for (const b of billRows) {
    const s = displayBillStatus(b);
    billStatusCounts[s] = (billStatusCounts[s] ?? 0) + 1;
  }

  // ------------------------------------------------------------
  // 6-month occupancy trend, derived from tenants.move_in_date /
  // move_out_date rather than the current `status` snapshot, so past
  // months reflect who was actually occupying a room at the time.
  // Total beds uses today's room capacity for all 6 months -- room
  // counts aren't tracked historically, and rarely change month to
  // month, so this is a reasonable approximation rather than exact.
  // ------------------------------------------------------------
  const totalBeds = roomRows.reduce((sum, r) => sum + r.capacity, 0);
  const now = new Date();

  const months = Array.from({ length: 6 }, (_, i) => {
    const offset = 5 - i;
    const monthStart = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0);
    return { monthStart, monthEnd };
  });

  const occupancyTrend = months.map(({ monthStart, monthEnd }) => {
    const occupied = tenantRows.filter((t) => {
      if (!t.room_id) return false;
      const movedIn = new Date(t.move_in_date + "T00:00:00");
      const movedOut = t.move_out_date
        ? new Date(t.move_out_date + "T00:00:00")
        : null;
      return movedIn <= monthEnd && (!movedOut || movedOut >= monthStart);
    }).length;

    return { label: monthLabel(monthStart), occupied };
  });

  // ------------------------------------------------------------
  // 6-month collections vs outstanding, bucketed by each bill's
  // billing_period_start.
  // ------------------------------------------------------------
  const financialTrend = months.map(({ monthStart, monthEnd }) => {
    const billsInMonth = billRows.filter((b) => {
      const periodStart = new Date(b.billing_period_start + "T00:00:00");
      return periodStart >= monthStart && periodStart <= monthEnd;
    });

    const billed = billsInMonth.reduce((sum, b) => sum + Number(b.total_amount), 0);
    const collected = billsInMonth.reduce((sum, b) => sum + Number(b.amount_paid), 0);

    return { label: monthLabel(monthStart), billed, collected };
  });

  const maxOccupied = Math.max(totalBeds, 1);
  const maxFinancial = Math.max(...financialTrend.map((m) => m.billed), 1);
  const maxRoomCount = Math.max(roomRows.length, 1);
  const maxBillCount = Math.max(billRows.length, 1);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs text-foreground-muted">Owner dashboard</p>
        <h1 className="font-heading text-lg font-semibold text-primary">
          Monitoring
        </h1>
        <p className="text-xs text-foreground-muted">
          Occupancy and collections trends, computed from your rooms, tenants,
          and bills.
        </p>
      </div>

      {/* Occupancy trend */}
      <div className="mb-6 rounded-lg border border-border bg-surface p-6">
        <p className="mb-4 font-heading text-sm font-semibold">
          Occupancy — last 6 months
        </p>
        <div className="space-y-2.5">
          {occupancyTrend.map((m) => (
            <BarRow
              key={m.label}
              label={m.label}
              value={`${m.occupied}/${totalBeds}`}
              fraction={m.occupied / maxOccupied}
              colorClass="bg-primary"
            />
          ))}
        </div>
      </div>

      {/* Financial trend */}
      <div className="mb-6 rounded-lg border border-border bg-surface p-6">
        <p className="mb-1 font-heading text-sm font-semibold">
          Billed vs collected — last 6 months
        </p>
        <p className="mb-4 text-xs text-foreground-muted">
          By billing period, not payment date.
        </p>
        <div className="space-y-4">
          {financialTrend.map((m) => (
            <div key={m.label}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">
                  {m.label}
                </span>
                <span className="font-mono text-xs text-foreground-muted">
                  {formatMoney(m.collected)} / {formatMoney(m.billed)}
                </span>
              </div>
              <div className="space-y-1">
                <BarRow
                  label="Billed"
                  value={formatMoney(m.billed)}
                  fraction={m.billed / maxFinancial}
                  colorClass="bg-accent"
                />
                <BarRow
                  label="Collected"
                  value={formatMoney(m.collected)}
                  fraction={m.collected / maxFinancial}
                  colorClass="bg-status-paid"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Room status breakdown */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-4 font-heading text-sm font-semibold">
            Rooms by status
          </p>
          <div className="space-y-2.5">
            {Object.entries(roomStatusCounts).map(([status, count]) => (
              <BarRow
                key={status}
                label={roomStatusLabels[status] ?? status}
                value={String(count)}
                fraction={count / maxRoomCount}
                colorClass={roomStatusColors[status] ?? "bg-primary"}
              />
            ))}
          </div>
        </div>

        {/* Bill status breakdown */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-4 font-heading text-sm font-semibold">
            Bills by status
          </p>
          <div className="space-y-2.5">
            {Object.entries(billStatusCounts).map(([status, count]) => (
              <BarRow
                key={status}
                label={billStatusLabels[status] ?? status}
                value={String(count)}
                fraction={count / maxBillCount}
                colorClass={billStatusColors[status] ?? "bg-primary"}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
