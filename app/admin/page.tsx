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
import {
  getPendingMaintenanceRequestsCount,
  getPendingRequestsCount,
} from "@/lib/shell-data";
import { IncomeExpenseChart } from "@/components/income-expense-chart";
import { RoomOccupancyMeter } from "@/components/room-occupancy-meter";
// add to the lucide-react import
import {
  Building2,
  Users,
  Banknote,
  Receipt,
  AlertTriangle,
  UserPlus,
  Wrench,
  ClipboardList,
  Check,
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
    { data: pendingMaintenanceRequests },
    pendingRequestsCount,
    pendingMaintenanceCount,
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
    supabase
      .from("maintenance_requests")
      .select("id, title, room_id, created_at")
      .eq("dorm_id", dormId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(3),
    getPendingRequestsCount(dormId),
    getPendingMaintenanceRequestsCount(dormId),
  ]);

  const roomRows = (rooms as RoomRow[] | null) ?? [];
  const tenantRows = (tenants as TenantRow[] | null) ?? [];
  const tenantIds = tenantRows.map((t) => t.id);

  const [
    { data: recentPayments },
    { data: allPayments },
    { data: pendingPayments, count: pendingPaymentsCount },
  ] = tenantIds.length
    ? await Promise.all([
        supabase
          .from("payments")
          .select("id, amount, paid_at, tenants(full_name)")
          .eq("status", "confirmed")
          .in("tenant_id", tenantIds)
          .order("paid_at", { ascending: false })
          .limit(5),
        supabase
          .from("payments")
          .select("amount, paid_at")
          .eq("status", "confirmed")
          .in("tenant_id", tenantIds),
        // Tenant-reported payments waiting for the owner to confirm or
        // reject -- the most actionable thing on the dashboard.
        supabase
          .from("payments")
          .select("id, amount, tenant_id, paid_at", { count: "exact" })
          .eq("status", "pending")
          .in("tenant_id", tenantIds)
          .order("paid_at", { ascending: true })
          .limit(3),
      ])
    : [{ data: [] }, { data: [] }, { data: [], count: 0 }];

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

  // Only available and full rooms contribute to usable capacity.
  const usableRooms = roomRows.filter(
    (room) => room.status === "available" || room.status === "full"
  );

  const usableRoomIds = new Set(usableRooms.map((room) => room.id));

  // Sum the actual bed capacity of usable rooms.
  const totalCapacity = usableRooms.reduce(
    (sum, room) => sum + Math.max(0, Number(room.capacity) || 0),
    0
  );

  // Count active tenants assigned to usable rooms.
  const occupiedBeds = activeTenants.filter(
    (tenant) => tenant.room_id !== null && usableRoomIds.has(tenant.room_id)
  ).length;

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
  //
  // allPayments is already filtered to status = 'confirmed' above --
  // a tenant-reported payment pending owner review must never inflate
  // income before it's actually been confirmed (see migration 0011 /
  // lib/actions.ts's reportPayment + confirmPendingPayment).
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
        daysOverdue,
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
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  const pendingPaymentItems = (pendingPayments ?? []).map((p) => ({
    key: `payment-${p.id}`,
    icon: Banknote,
    iconClass: "text-status-partial",
    title: `${tenantNameById.get(p.tenant_id) ?? "A tenant"} · ${formatMoney(
      p.amount
    )}`,
    detail: "Payment report waiting for your confirmation",
    href: "/admin/payments",
  }));

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

  // alongside maintenanceItems, using the room-number lookup already built above
  const maintenanceRequestItems = (pendingMaintenanceRequests ?? []).map(
    (r) => ({
      key: `maint-request-${r.id}`,
      icon: ClipboardList,
      iconClass: "text-status-partial",
      title: r.title,
      detail: r.room_id
        ? `Room ${roomNumberById.get(r.room_id) ?? "—"} · needs review`
        : "Needs review",
      href: "/admin/maintenance",
    })
  );

  // Ordered by how actionable each is: money waiting on you first.
  const attentionItems = [
    ...pendingPaymentItems,
    ...overdueItems,
    ...applicationItems,
    ...maintenanceRequestItems,
    ...maintenanceItems,
  ].slice(0, 5);

  // Exact counts for the summary chips (the lists above are capped).
  const attentionChips = [
    {
      key: "payments",
      label: "payments to confirm",
      count: pendingPaymentsCount ?? 0,
      href: "/admin/payments",
      icon: Banknote,
      iconClass: "text-status-partial",
    },
    {
      key: "overdue",
      label: "overdue bills",
      count: overdueItems.length,
      href: "/admin/billing",
      icon: AlertTriangle,
      iconClass: "text-status-overdue",
    },
    {
      key: "requests",
      label: "tenant requests",
      count: pendingRequestsCount,
      href: "/admin/tenant-requests",
      icon: UserPlus,
      iconClass: "text-status-partial",
    },
    {
      key: "maintenance",
      label: "maintenance requests",
      count: pendingMaintenanceCount,
      href: "/admin/maintenance",
      icon: ClipboardList,
      iconClass: "text-status-partial",
    },
  ].filter((chip) => chip.count > 0);

  // First-run guidance: the four things a new owner has to do, in order,
  // each derived from real data so it ticks itself off.
  const setupSteps = [
    {
      key: "rooms",
      label: "Add your rooms",
      hint: "Rooms are what tenants get assigned to and billed for.",
      done: totalRooms > 0,
      href: "/admin/rooms#add-room",
    },
    {
      key: "share",
      label: "Share your Dorm ID",
      hint: "Tenants sign up with it. It's at the bottom of this page.",
      done: tenantRows.length > 0 || pendingRequestsCount > 0,
      href: "#dorm-id",
    },
    {
      key: "assign",
      label: "Approve tenants and assign rooms",
      hint: "Review sign-ups, then put each tenant in a room.",
      done: occupiedBeds > 0,
      href: "/admin/tenant-requests",
    },
    {
      key: "bills",
      label: "Generate your first bills",
      hint: "One click creates this month's rent bills.",
      done: (bills ?? []).length > 0,
      href: "/admin/billing",
    },
  ];
  const setupDone = setupSteps.filter((s) => s.done).length;
  const nextSetupStep = setupSteps.find((s) => !s.done);

  const ownerFirstName =
    (session.profile?.full_name ?? "").split(" ")[0] || "there";

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-lg font-semibold text-primary">
          Hi, {ownerFirstName}
        </h1>
        <p className="text-xs text-foreground-muted">
          Here&apos;s what&apos;s happening with{" "}
          {dorm?.name ?? "your dormitory"}.
        </p>
      </div>

      {/* Setup checklist -- only until the basics are in place */}
      {nextSetupStep && (
        <div className="mb-6 rounded-lg border border-border bg-surface p-5">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <p className="font-heading text-sm font-semibold">
              Get your dorm set up
            </p>
            <p className="text-xs text-foreground-muted">
              {setupDone} of {setupSteps.length} done
            </p>
          </div>

          <div
            className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={setupSteps.length}
            aria-valuenow={setupDone}
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(setupDone / setupSteps.length) * 100}%` }}
            />
          </div>

          <ol className="space-y-1">
            {setupSteps.map((step, i) => {
              const isNext = step.key === nextSetupStep.key;
              return (
                <li key={step.key}>
                  <Link
                    href={step.href}
                    className={`flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-muted ${
                      isNext ? "bg-surface-muted" : ""
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                        step.done
                          ? "bg-status-paid text-surface"
                          : isNext
                          ? "bg-primary text-surface"
                          : "border border-border text-foreground-muted"
                      }`}
                    >
                      {step.done ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block text-sm font-medium ${
                          step.done
                            ? "text-foreground-muted line-through"
                            : "text-foreground"
                        }`}
                      >
                        {step.label}
                      </span>
                      {!step.done && (
                        <span className="block text-xs text-foreground-muted">
                          {step.hint}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Needs-attention summary chips -- exact counts, one tap away */}
      {attentionChips.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {attentionChips.map((chip) => {
            const Icon = chip.icon;
            return (
              <Link
                key={chip.key}
                href={chip.href}
                className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              >
                <Icon className={`h-3.5 w-3.5 ${chip.iconClass}`} />
                <span>
                  <span className="font-mono font-semibold text-foreground">
                    {chip.count}
                  </span>{" "}
                  {chip.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}

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
            <p className="text-xs">Pending Rent Payments</p>
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
          <RoomOccupancyMeter
            counts={roomCounts}
            occupiedBeds={occupiedBeds}
            totalCapacity={totalCapacity}
          />
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
      <div
        id="dorm-id"
        className="scroll-mt-6 rounded-lg border border-border bg-surface p-6"
      >
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
