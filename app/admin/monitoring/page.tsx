import { applyLateFees } from "@/lib/late-fees";
import { getGraceDays } from "@/lib/shell-data";
import { LoadError } from "@/components/load-error";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney, displayBillStatus } from "@/lib/billing";
import { AlertTriangle, BedDouble, Receipt, TrendingUp } from "lucide-react";
import {
  BilledCollectedColumns,
  OccupancyColumns,
  StatTile,
  StatusDonut,
} from "@/components/monitoring-charts";

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
  available: "var(--color-status-paid)",
  full: "var(--color-status-unpaid)",
  maintenance: "var(--color-status-partial)",
};

const billStatusLabels: Record<string, string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
  overdue: "Overdue",
};

const billStatusColors: Record<string, string> = {
  paid: "var(--color-status-paid)",
  partial: "var(--color-status-partial)",
  unpaid: "var(--color-status-unpaid)",
  overdue: "var(--color-status-overdue)",
};

function monthLabel(d: Date) {
  return d.toLocaleDateString("en-PH", { month: "short", year: "2-digit" });
}

export default async function MonitoringPage() {
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role !== "owner") redirect("/tenant");

  const dormId = session.profile?.dorm_id;
  if (!dormId) redirect("/");

  // Charge the late fee on anything that has just gone past due, before the bills are read.
  await applyLateFees(dormId);

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
    console.error("Could not load monitoring data:", loadError);
    return (
      <div className="mx-auto max-w-3xl">
        <LoadError what="monitoring data" />
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
  // Current snapshot: bill status breakdown, plus what is still owed
  // ------------------------------------------------------------
  const billStatusCounts: Record<string, number> = {
    paid: 0,
    partial: 0,
    unpaid: 0,
    overdue: 0,
  };
  let outstandingTotal = 0;
  let outstandingBills = 0;
  let overdueTotal = 0;
  const graceDays = await getGraceDays(dormId);
  for (const b of billRows) {
    const s = displayBillStatus(b, graceDays);
    billStatusCounts[s] = (billStatusCounts[s] ?? 0) + 1;

    if (s !== "paid") {
      const owed = Math.max(0, Number(b.total_amount) - Number(b.amount_paid));
      outstandingTotal += owed;
      outstandingBills++;
      if (s === "overdue") overdueTotal += owed;
    }
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

  // ------------------------------------------------------------
  // Headline figures
  // ------------------------------------------------------------
  const occupiedNow = tenantRows.filter((t) => t.status === "active" && t.room_id).length;
  const occupancyRate = totalBeds > 0 ? Math.min(1, occupiedNow / totalBeds) : 0;

  const thisMonth = financialTrend[financialTrend.length - 1];
  const collectionRate = thisMonth.billed > 0 ? thisMonth.collected / thisMonth.billed : null;

  const overdueCount = billStatusCounts.overdue ?? 0;

  return (
    <div className="mx-auto max-w-5xl">
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

      {/* At a glance */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={BedDouble}
          label="Bed occupancy"
          value={`${Math.round(occupancyRate * 100)}%`}
          sub={`${occupiedNow} of ${totalBeds} beds occupied`}
          progress={occupancyRate}
        />
        <StatTile
          icon={TrendingUp}
          label="Collected this month"
          value={collectionRate === null ? "—" : `${Math.round(collectionRate * 100)}%`}
          sub={
            collectionRate === null
              ? "No bills for this month yet"
              : `${formatMoney(thisMonth.collected)} of ${formatMoney(thisMonth.billed)}`
          }
          tone={
            collectionRate === null
              ? "default"
              : collectionRate >= 0.9
                ? "good"
                : collectionRate >= 0.6
                  ? "warn"
                  : "bad"
          }
          progress={collectionRate ?? 0}
        />
        <StatTile
          icon={Receipt}
          label="Still owed"
          value={formatMoney(outstandingTotal)}
          sub={
            outstandingBills === 0
              ? "Everything is paid"
              : `across ${outstandingBills} unpaid bill${outstandingBills === 1 ? "" : "s"}`
          }
          tone={outstandingTotal > 0 ? "warn" : "good"}
        />
        <StatTile
          icon={AlertTriangle}
          label="Overdue bills"
          value={String(overdueCount)}
          sub={overdueCount === 0 ? "None overdue" : `${formatMoney(overdueTotal)} overdue`}
          tone={overdueCount > 0 ? "bad" : "good"}
        />
      </div>

      {/* Trends */}
      <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-1 font-heading text-sm font-semibold">
            Occupancy
          </p>
          <p className="mb-4 text-xs text-foreground-muted">Last 6 months</p>
          <OccupancyColumns data={occupancyTrend} totalBeds={totalBeds} />
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-1 font-heading text-sm font-semibold">
            Billed vs collected
          </p>
          <p className="mb-4 text-xs text-foreground-muted">
            Last 6 months, by billing period, not payment date.
          </p>
          <BilledCollectedColumns data={financialTrend} />
        </div>
      </div>

      {/* Current breakdowns */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-4 font-heading text-sm font-semibold">
            Rooms by status
          </p>
          <StatusDonut
            centerLabel={roomRows.length === 1 ? "room" : "rooms"}
            ariaLabel="Rooms by status"
            segments={Object.entries(roomStatusCounts).map(([status, count]) => ({
              label: roomStatusLabels[status] ?? status,
              value: count,
              color: roomStatusColors[status] ?? "var(--color-primary)",
            }))}
          />
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-4 font-heading text-sm font-semibold">
            Bills by status
          </p>
          <StatusDonut
            centerLabel={billRows.length === 1 ? "bill" : "bills"}
            ariaLabel="Bills by status"
            segments={Object.entries(billStatusCounts).map(([status, count]) => ({
              label: billStatusLabels[status] ?? status,
              value: count,
              color: billStatusColors[status] ?? "var(--color-primary)",
            }))}
          />
        </div>
      </div>
    </div>
  );
}
