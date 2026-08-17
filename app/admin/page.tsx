import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatMoney,
  displayBillStatus,
  formatPaymentDate,
} from "@/lib/billing";
import { CopyButton } from "@/components/copy-button";
import { IncomeExpenseChart } from "@/components/income-expense-chart";
import { RoomOccupancyMeter } from "@/components/room-occupancy-meter";
import {
  Building2,
  Users,
  Banknote,
  Receipt,
  AlertTriangle,
  UserPlus,
  Wrench,
} from "lucide-react";

type RoomRow = {
  id: string;
  room_number: string;
  capacity: number;
  status: string;
};

type TenantRow = {
  id: string;
  room_id: string | null;
  status: string;
  full_name: string;
  move_in_date: string;
};

type BillRow = {
  id: string;
  status: string;
  due_date: string;
  total_amount: number | string;
  amount_paid: number | string;
  tenant_id: string;
  room_id: string | null;
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

  const [
    { data: dorm },
    { data: rooms },
    { data: tenants },
    { data: bills },
    { data: transactions },
    { data: pendingRequests },
  ] = await Promise.all([
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
      .select("id, room_id, status, full_name, move_in_date")
      .eq("dorm_id", dormId),
    supabase
      .from("bills")
      .select(
        "id, status, due_date, total_amount, amount_paid, tenant_id, room_id"
      )
      .eq("dorm_id", dormId),
    supabase
      .from("transactions")
      .select("type, category, amount, occurred_at")
      .eq("dorm_id", dormId),
    supabase
      .from("tenant_registration_requests")
      .select("id, full_name, requested_room_note, submitted_at")
      .eq("dorm_id", dormId)
      .eq("status", "pending")
      .order("submitted_at", { ascending: true })
      .limit(3),
  ]);

  const roomRows = (rooms as RoomRow[] | null) ?? [];
  const tenantRows = (tenants as TenantRow[] | null) ?? [];
  const tenantIds = tenantRows.map((t) => t.id);

  const [{ data: recentPayments }, { data: allPayments }] = tenantIds.length
    ? await Promise.all([
        supabase
          .from("payments")
          .select("id, amount, paid_at, tenants(full_name)")
          .in("tenant_id", tenantIds)
          .order("paid_at", { ascending: false })
          .limit(5),
        supabase
          .from("payments")
          .select("amount, paid_at")
          .in("tenant_id", tenantIds),
      ])
    : [{ data: [] }, { data: [] }];

  // ------------------------------------------------------------
  // Derived stats — every number below comes straight from the
  // queries above; nothing here is fabricated or estimated.
  // ------------------------------------------------------------

  const totalRooms = roomRows.length;
  const occupiedRooms = roomRows.filter((r) => r.status === "full").length;
  const roomCounts = {
    available: roomRows.filter((r) => r.status === "available").length,
    full: occupiedRooms,
    maintenance: roomRows.filter((r) => r.status === "maintenance").length,
    inactive: roomRows.filter((r) => r.status === "inactive").length,
  };

  const activeTenants = tenantRows.filter((t) => t.status === "active");

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const newActiveThisMonth = activeTenants.filter((t) => {
    const movedIn = new Date(t.move_in_date + "T00:00:00");
    return movedIn >= currentMonthStart && movedIn < currentMonthEnd;
  }).length;

  // ------------------------------------------------------------
  // Financial summary — payments and transactions are two separate,
  // unlinked ledgers (payments = rent collected against bills;
  // transactions = everything else). Total income sums both, but
  // excludes any transaction logged under the 'rent' category: rent
  // income is already fully captured via payments/bills, so counting
  // a manually-logged 'rent' transaction too would double it. This is
  // the single source of truth for income/expense figures across the
  // app (Overview, Expenses, Monitoring) -- see lib/actions.ts's
  // createTransaction, which no longer offers 'rent' as an income
  // category for exactly this reason.
  // ------------------------------------------------------------
  const paymentRows = allPayments ?? [];
  const transactionRows = transactions ?? [];

  const months = Array.from({ length: 6 }, (_, i) => {
    const offset = 5 - i;
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    return {
      start,
      end,
      label: start.toLocaleDateString("en-PH", {
        month: "short",
        year: "2-digit",
      }),
    };
  });

  const monthlyTrend = months.map(({ start, end, label }) => {
    const income =
      paymentRows
        .filter((p) => {
          const d = new Date(p.paid_at);
          return d >= start && d < end;
        })
        .reduce((sum, p) => sum + Number(p.amount), 0) +
      transactionRows
        .filter((t) => {
          if (t.type !== "income" || t.category === "rent") return false;
          const d = new Date(t.occurred_at + "T00:00:00");
          return d >= start && d < end;
        })
        .reduce((sum, t) => sum + Number(t.amount), 0);

    const expenses = transactionRows
      .filter((t) => {
        if (t.type !== "expense") return false;
        const d = new Date(t.occurred_at + "T00:00:00");
        return d >= start && d < end;
      })
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return { label, income, expenses };
  });

  const monthlyRevenue = monthlyTrend[monthlyTrend.length - 1]?.income ?? 0;

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

  // ------------------------------------------------------------
  // Needs attention — unifies three otherwise-disconnected signals
  // (overdue bills, pending sign-up requests, rooms under maintenance)
  // into one prioritized list instead of three separate UI blocks.
  // ------------------------------------------------------------
  const tenantNameById = new Map(tenantRows.map((t) => [t.id, t.full_name]));
  const roomNumberById = new Map(roomRows.map((r) => [r.id, r.room_number]));

  const overdueItems = billsWithStatus
    .filter((b) => b.displayStatus === "overdue")
    .map((b) => {
      const daysOverdue = Math.floor(
        (now.getTime() - new Date(b.due_date + "T00:00:00").getTime()) /
          86_400_000
      );
      return {
        key: `bill-${b.id}`,
        icon: AlertTriangle,
        iconClass: "text-status-overdue",
        title: `Room ${
          b.room_id ? roomNumberById.get(b.room_id) ?? "—" : "—"
        } · ${formatMoney(Number(b.total_amount) - Number(b.amount_paid))}`,
        detail: `${
          tenantNameById.get(b.tenant_id) ?? "Unknown tenant"
        } · ${daysOverdue}d overdue`,
        href: "/admin/billing",
      };
    })
    .sort((a, b) => (a.detail < b.detail ? 1 : -1));

  const applicationItems = (pendingRequests ?? []).map((r) => ({
    key: `request-${r.id}`,
    icon: UserPlus,
    iconClass: "text-status-partial",
    title: r.full_name,
    detail: r.requested_room_note
      ? `Wants to join · ${r.requested_room_note}`
      : "Wants to join your dormitory",
    href: "/admin/tenant-requests",
  }));

  const maintenanceItems = roomRows
    .filter((r) => r.status === "maintenance")
    .map((r) => ({
      key: `room-${r.id}`,
      icon: Wrench,
      iconClass: "text-status-partial",
      title: `Room ${r.room_number}`,
      detail: "Under maintenance",
      href: "/admin/rooms",
    }));

  const attentionItems = [
    ...overdueItems,
    ...applicationItems,
    ...maintenanceItems,
  ].slice(0, 5);

  const ownerFirstName =
    (session.profile?.full_name ?? "").split(" ")[0] || "there";

  return (
    <div className="mx-auto max-w-5xl">
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

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex items-center gap-2 text-foreground-muted">
            <Building2 className="h-4 w-4" />
            <p className="text-xs">Total rooms</p>
          </div>
          <p className="font-heading text-xl font-semibold text-foreground">
            {totalRooms}
          </p>
          <p className="text-[11px] text-foreground-muted">
            {occupiedRooms} occupied
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex items-center gap-2 text-foreground-muted">
            <Users className="h-4 w-4" />
            <p className="text-xs">Active tenants</p>
          </div>
          <p className="font-heading text-xl font-semibold text-foreground">
            {activeTenants.length}
          </p>
          <p className="text-[11px] text-foreground-muted">
            {newActiveThisMonth > 0 ? `+${newActiveThisMonth} this month` : " "}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex items-center gap-2 text-foreground-muted">
            <Banknote className="h-4 w-4" />
            <p className="text-xs">Monthly revenue</p>
          </div>
          <p className="font-mono text-xl font-semibold text-status-paid">
            {formatMoney(monthlyRevenue)}
          </p>
          <p className="text-[11px] text-foreground-muted">This month</p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex items-center gap-2 text-foreground-muted">
            <Receipt className="h-4 w-4" />
            <p className="text-xs">Pending payments</p>
          </div>
          <p
            className={`font-mono text-xl font-semibold ${
              outstandingTotal > 0 ? "text-status-overdue" : "text-foreground"
            }`}
          >
            {formatMoney(outstandingTotal)}
          </p>
          <p className="text-[11px] text-foreground-muted">Outstanding</p>
        </div>
      </div>

      {/* Income vs Expenses + Room Occupancy */}
      <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-1 font-heading text-sm font-semibold">
            Income vs Expenses
          </p>
          <p className="mb-4 text-xs text-foreground-muted">Last 6 months</p>
          <IncomeExpenseChart data={monthlyTrend} />
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-4 font-heading text-sm font-semibold">
            Room Occupancy
          </p>
          <RoomOccupancyMeter counts={roomCounts} totalRooms={totalRooms} />
        </div>
      </div>

      {/* Recent Payments + Needs Attention */}
      <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-heading font-semibold">
              Recent payments
            </span>
            <Link
              href="/admin/payments"
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
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
              No payments yet. Payment activity will appear here once tenants
              make payments.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-heading font-semibold">
            Needs attention
          </div>
          {attentionItems.length > 0 ? (
            <div>
              {attentionItems.map((item, i) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-muted ${
                      i < attentionItems.length - 1
                        ? "border-b border-border"
                        : ""
                    }`}
                  >
                    <Icon
                      className={`mt-0.5 h-4 w-4 shrink-0 ${item.iconClass}`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {item.title}
                      </p>
                      <p className="truncate text-xs text-foreground-muted">
                        {item.detail}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-foreground-muted">
              Nothing needs your attention right now.
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-md bg-surface-muted px-3 py-2">
            <span className="font-mono text-sm tracking-wider text-accent">
              {dorm?.join_code ?? "—"}
            </span>
          </div>

          {dorm?.join_code && (
            <CopyButton value={dorm.join_code} label="Copy Dorm ID" />
          )}
        </div>
      </div>
    </div>
  );
}
