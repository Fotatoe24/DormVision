import type { createAdminClient } from "@/lib/supabase/admin";
import { displayBillStatus, formatBillDate } from "@/lib/billing";
import { manilaToday } from "@/lib/reminders";
import {
  calendarDate,
  defineSheet,
  manilaWallTime,
  type ExportSheet,
} from "@/lib/export/workbook";
import {
  addDays,
  describeDateFilter,
  exportFileName,
  incomeRangeBounds,
  incomeRangeLabels,
  likeTerm,
  manilaDayRange,
  parseIncomeRange,
  parseIsoDate,
  prettyDate,
  type ExportKind,
} from "@/lib/export/filters";

// What each export contains. Every loader reads ONLY the signed-in owner's dorm
// (every query is scoped by dorm_id) and honours the same filters as the page the
// Export button sits on.

type Admin = ReturnType<typeof createAdminClient>;

export type ExportContext = {
  admin: Admin;
  dormId: string;
  dormName: string;
  graceDays: number;
  // The raw query string of the request.
  params: URLSearchParams;
};

export type ExportResult = { fileName: string; sheets: ExportSheet<unknown>[] };

// A single worksheet is capped so a runaway export can't exhaust memory; the
// sheet says so when it happens.
const PAGE = 1000; // PostgREST returns at most this many rows per request
const MAX_ROWS = 20_000;

async function fetchAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>
) {
  const rows: T[] = [];

  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw error;

    rows.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < PAGE) return { rows, truncated: false };
  }

  return { rows, truncated: true };
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const one = <T,>(rel: T | T[] | null | undefined): T | null =>
  Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null);

const methodLabels: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  gcash: "GCash",
  other: "Other",
};

const categoryLabels: Record<string, string> = {
  rent: "Rent",
  other_income: "Other income",
  utilities: "Utilities",
  repairs: "Repairs & maintenance",
  supplies: "Supplies",
  other_expense: "Other expense",
};

const statusLabels: Record<string, string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
  overdue: "Overdue",
};

const money = (n: number) => Math.round(n * 100) / 100;

function subtitleFor(ctx: ExportContext, filters: string, truncated: boolean) {
  const generated = new Date().toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });

  return [
    ctx.dormName,
    `Filters: ${filters}`,
    `Generated ${generated} (Manila time)`,
    ...(truncated
      ? [`Only the first ${MAX_ROWS.toLocaleString("en-PH")} rows are shown. Narrow the filters to see the rest.`]
      : []),
  ];
}

function billingPeriod(start: string | null, end: string | null) {
  return start && end ? `${formatBillDate(start)} – ${formatBillDate(end)}` : "";
}

// ---------------------------------------------------------------------------
// Payments

type PaymentRow = {
  id: string;
  amount: number | string;
  method: string;
  paid_at: string;
  notes: string | null;
  receipt_number: string | null;
  tenants: { full_name: string; room_id: string | null } | { full_name: string; room_id: string | null }[] | null;
  bills: { billing_period_start: string; billing_period_end: string } | { billing_period_start: string; billing_period_end: string }[] | null;
};

async function roomNumbers(ctx: ExportContext) {
  const { data, error } = await ctx.admin.from("rooms").select("id, room_number").eq("dorm_id", ctx.dormId);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.id as string, r.room_number as string]));
}

async function paymentsExport(ctx: ExportContext): Promise<ExportResult> {
  const q = likeTerm(ctx.params.get("q") ?? "");
  const method = ctx.params.get("method") ?? "";
  const from = parseIsoDate(ctx.params.get("from"));
  const to = parseIsoDate(ctx.params.get("to"));
  const { fromIso, toExclusiveIso } = manilaDayRange(from, to);

  const rooms = await roomNumbers(ctx);

  const { rows, truncated } = await fetchAll<PaymentRow>((a, b) => {
    // `tenants!inner` + the dorm filter scopes payments to this dorm without
    // listing every tenant id in the URL (payments has no dorm_id of its own).
    let query = ctx.admin
      .from("payments")
      .select(
        "id, amount, method, paid_at, notes, receipt_number, tenants!inner(full_name, room_id, dorm_id), bills(billing_period_start, billing_period_end)"
      )
      .eq("status", "confirmed")
      .eq("tenants.dorm_id", ctx.dormId)
      .order("paid_at", { ascending: false })
      .order("id");

    if (methodLabels[method]) query = query.eq("method", method);
    if (fromIso) query = query.gte("paid_at", fromIso);
    if (toExclusiveIso) query = query.lt("paid_at", toExclusiveIso);
    if (q) query = query.ilike("tenants.full_name", `%${q}%`);

    return query.range(a, b);
  });

  const byMethod = new Map<string, number>();
  for (const p of rows) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + Number(p.amount));

  const total = rows.reduce((sum, p) => sum + Number(p.amount), 0);

  const filters = [
    describeDateFilter(from, to),
    methodLabels[method] ? `Method: ${methodLabels[method]}` : "All methods",
    q ? `Tenant contains "${q}"` : null,
  ].filter(Boolean).join(" · ");

  return {
    fileName: exportFileName(ctx.dormName, "payments", manilaToday(), from || to ? `${from ?? "start"}-to-${to ?? "today"}` : undefined),
    sheets: [
      defineSheet<PaymentRow>({
        name: "Payments",
        title: "Payments received",
        subtitle: subtitleFor(ctx, filters, truncated),
        summary: [
          { label: "Number of payments", value: rows.length, money: false },
          { label: "Total collected", value: money(total) },
          ...[...byMethod.entries()].map(([m, amount]) => ({ label: `  ${methodLabels[m] ?? m}`, value: money(amount) })),
        ],
        columns: [
          { header: "Date & time paid", width: 20, type: "datetime", value: (p) => manilaWallTime(p.paid_at) },
          { header: "Receipt no.", width: 16, value: (p) => p.receipt_number },
          { header: "Tenant", width: 26, value: (p) => one(p.tenants)?.full_name },
          { header: "Room", width: 9, value: (p) => { const r = one(p.tenants)?.room_id; return r ? rooms.get(r) : null; } },
          { header: "Method", width: 14, value: (p) => methodLabels[p.method] ?? p.method },
          { header: "Amount (₱)", width: 14, type: "money", total: true, value: (p) => Number(p.amount) },
          { header: "Billing period", width: 28, value: (p) => { const b = one(p.bills); return b ? billingPeriod(b.billing_period_start, b.billing_period_end) : null; } },
          { header: "Notes", width: 30, value: (p) => p.notes },
        ],
        rows,
        emptyMessage: "No payments match these filters.",
      }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Income & expenses

type TxRow = {
  id: string;
  type: string;
  category: string;
  amount: number | string;
  description: string | null;
  occurred_at: string;
};

type LedgerRow = {
  date: Date | null;
  sortKey: number;
  type: "Income" | "Expense";
  category: string;
  categoryKey: string;
  description: string;
  amount: number;
};

async function incomeExpensesExport(ctx: ExportContext): Promise<ExportResult> {
  const customFrom = parseIsoDate(ctx.params.get("from"));
  const customTo = parseIsoDate(ctx.params.get("to"));
  const range = parseIncomeRange(ctx.params.get("range"));
  const category = ctx.params.get("category") ?? "";
  const q = (ctx.params.get("q") ?? "").trim().toLowerCase();

  // A custom date range wins over the preset periods.
  const custom = Boolean(customFrom || customTo);
  const preset = incomeRangeBounds(range);
  const start = custom ? (customFrom ?? "1970-01-01") : preset.start;
  const end = custom ? (customTo ? addDays(customTo, 1) : addDays(manilaToday(), 1)) : preset.end;

  const [tx, payments] = await Promise.all([
    fetchAll<TxRow>((a, b) =>
      ctx.admin
        .from("transactions")
        .select("id, type, category, amount, description, occurred_at")
        .eq("dorm_id", ctx.dormId)
        .gte("occurred_at", start)
        .lt("occurred_at", end)
        .order("occurred_at", { ascending: false })
        .order("id")
        .range(a, b)
    ),
    fetchAll<PaymentRow>((a, b) =>
      ctx.admin
        .from("payments")
        .select("id, amount, method, paid_at, notes, receipt_number, tenants!inner(full_name, room_id, dorm_id)")
        .eq("status", "confirmed")
        .eq("tenants.dorm_id", ctx.dormId)
        .gte("paid_at", `${start}T00:00:00+08:00`)
        .lt("paid_at", `${end}T00:00:00+08:00`)
        .order("paid_at", { ascending: false })
        .order("id")
        .range(a, b)
    ),
  ]);

  const rooms = await roomNumbers(ctx);

  const ledger: LedgerRow[] = [
    ...payments.rows.map((p): LedgerRow => {
      const tenant = one(p.tenants);
      const room = tenant?.room_id ? rooms.get(tenant.room_id) : null;
      const wall = manilaWallTime(p.paid_at);
      return {
        date: wall ? new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate())) : null,
        sortKey: Date.parse(p.paid_at),
        type: "Income",
        category: categoryLabels.rent,
        categoryKey: "rent",
        description: `Rent payment · ${tenant?.full_name ?? "Unknown tenant"}${room ? ` · Room ${room}` : ""}`,
        amount: Number(p.amount),
      };
    }),
    ...tx.rows.map((t): LedgerRow => ({
      date: calendarDate(t.occurred_at),
      sortKey: Date.parse(`${t.occurred_at}T00:00:00+08:00`),
      type: t.type === "income" ? "Income" : "Expense",
      category: categoryLabels[t.category] ?? t.category,
      categoryKey: t.category,
      description: t.description ?? "",
      amount: Number(t.amount),
    })),
  ]
    .filter((row) => !category || category === "all" || row.categoryKey === category)
    .filter((row) => !q || `${row.category} ${row.description}`.toLowerCase().includes(q))
    .sort((a, b) => b.sortKey - a.sortKey);

  const income = ledger.filter((r) => r.type === "Income").reduce((s, r) => s + r.amount, 0);
  const expense = ledger.filter((r) => r.type === "Expense").reduce((s, r) => s + r.amount, 0);

  // Totals per category, for the second sheet.
  const byCategory = new Map<string, { type: string; category: string; count: number; total: number }>();
  for (const row of ledger) {
    const key = `${row.type}:${row.categoryKey}`;
    const entry = byCategory.get(key) ?? { type: row.type, category: row.category, count: 0, total: 0 };
    entry.count++;
    entry.total += row.amount;
    byCategory.set(key, entry);
  }
  const categoryRows = [...byCategory.values()].sort(
    (a, b) => a.type.localeCompare(b.type) || b.total - a.total
  );

  const period = custom
    ? describeDateFilter(customFrom, customTo)
    : `${incomeRangeLabels[range]} (${prettyDate(preset.start)} – ${prettyDate(addDays(preset.end, -1))})`;
  const truncated = tx.truncated || payments.truncated;
  const filters = [
    period,
    category && category !== "all" ? `Category: ${categoryLabels[category] ?? category}` : "All categories",
    q ? `Search "${ctx.params.get("q")}"` : null,
  ].filter(Boolean).join(" · ");

  return {
    fileName: exportFileName(ctx.dormName, "income-expenses", manilaToday(), custom ? `${customFrom ?? "start"}-to-${customTo ?? "today"}` : range),
    sheets: [
      defineSheet<LedgerRow>({
        name: "Income & Expenses",
        title: "Income & expenses",
        subtitle: subtitleFor(ctx, filters, truncated),
        summary: [
          { label: "Total income", value: money(income) },
          { label: "Total expenses", value: money(expense) },
          { label: "Net income", value: money(income - expense) },
        ],
        columns: [
          { header: "Date", width: 14, type: "date", value: (r) => r.date },
          { header: "Type", width: 10, value: (r) => r.type },
          { header: "Category", width: 22, value: (r) => r.category },
          { header: "Description", width: 44, value: (r) => r.description },
          { header: "Income (₱)", width: 15, type: "money", total: true, value: (r) => (r.type === "Income" ? r.amount : null) },
          { header: "Expense (₱)", width: 15, type: "money", total: true, value: (r) => (r.type === "Expense" ? r.amount : null) },
        ],
        rows: ledger,
        emptyMessage: "No income or expenses match these filters.",
      }),
      defineSheet<(typeof categoryRows)[number]>({
        name: "By category",
        title: "Totals by category",
        subtitle: subtitleFor(ctx, filters, false),
        columns: [
          { header: "Type", width: 12, value: (r) => r.type },
          { header: "Category", width: 26, value: (r) => r.category },
          { header: "Entries", width: 10, type: "integer", total: true, value: (r) => r.count },
          { header: "Total (₱)", width: 16, type: "money", value: (r) => money(r.total) },
        ],
        rows: categoryRows,
        emptyMessage: "Nothing to total for these filters.",
      }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Bills (rent and water & electricity)

type BillRow = {
  id: string;
  billing_period_start: string;
  billing_period_end: string;
  due_date: string;
  rent_amount: number | string;
  other_charges: number | string;
  late_fee: number | string;
  total_amount: number | string;
  amount_paid: number | string;
  status: string;
  invoice_number: string | null;
  tenants: { full_name: string } | { full_name: string }[] | null;
  rooms: { room_number: string } | { room_number: string }[] | null;
};

type UtilityRow = {
  id: string;
  billing_period_start: string;
  billing_period_end: string;
  due_date: string;
  water_amount: number | string;
  electricity_amount: number | string;
  total_amount: number | string;
  amount_paid: number | string;
  status: string;
  notes: string | null;
  rooms: { room_number: string } | { room_number: string }[] | null;
};

async function billsExport(ctx: ExportContext): Promise<ExportResult> {
  const status = ctx.params.get("status") ?? "";
  const from = parseIsoDate(ctx.params.get("from"));
  const to = parseIsoDate(ctx.params.get("to"));
  const q = (ctx.params.get("q") ?? "").trim().toLowerCase();

  const [rent, utility] = await Promise.all([
    fetchAll<BillRow>((a, b) => {
      let query = ctx.admin
        .from("bills")
        .select(
          "id, billing_period_start, billing_period_end, due_date, rent_amount, other_charges, late_fee, total_amount, amount_paid, status, invoice_number, tenants(full_name), rooms(room_number)"
        )
        .eq("dorm_id", ctx.dormId)
        .order("due_date", { ascending: false })
        .order("id");
      if (from) query = query.gte("due_date", from);
      if (to) query = query.lte("due_date", to);
      return query.range(a, b);
    }),
    fetchAll<UtilityRow>((a, b) => {
      let query = ctx.admin
        .from("utility_bills")
        .select(
          "id, billing_period_start, billing_period_end, due_date, water_amount, electricity_amount, total_amount, amount_paid, status, notes, rooms(room_number)"
        )
        .eq("dorm_id", ctx.dormId)
        .order("due_date", { ascending: false })
        .order("id");
      if (from) query = query.gte("due_date", from);
      if (to) query = query.lte("due_date", to);
      return query.range(a, b);
    }),
  ]);

  // "Overdue" is worked out from the due date and the dorm's grace period, the
  // same as everywhere else in the app, so filter on THAT status, not the stored one.
  const statusOf = (b: { status: string; due_date: string }) => displayBillStatus(b, ctx.graceDays);
  const wanted = statusLabels[status] ? status : "";

  const rentRows = rent.rows
    .map((b) => ({ ...b, shown: statusOf(b) }))
    .filter((b) => !wanted || b.shown === wanted)
    .filter((b) => !q || (one(b.tenants)?.full_name ?? "").toLowerCase().includes(q));
  const utilityRows = utility.rows
    .map((b) => ({ ...b, shown: statusOf(b) }))
    .filter((b) => !wanted || b.shown === wanted)
    .filter((b) => !q || (one(b.rooms)?.room_number ?? "").toLowerCase().includes(q));

  const filters = [
    describeDateFilter(from, to).replace(/^All dates$/, "All due dates"),
    wanted ? `Status: ${statusLabels[wanted]}` : "All statuses",
    q ? `Search "${ctx.params.get("q")}"` : null,
  ].filter(Boolean).join(" · ");

  const owed = (b: { total_amount: number | string; amount_paid: number | string }) =>
    Math.max(0, Number(b.total_amount) - Number(b.amount_paid));

  const billedTotal = rentRows.reduce((s, b) => s + Number(b.total_amount), 0) + utilityRows.reduce((s, b) => s + Number(b.total_amount), 0);
  const paidTotal = rentRows.reduce((s, b) => s + Number(b.amount_paid), 0) + utilityRows.reduce((s, b) => s + Number(b.amount_paid), 0);
  const owedTotal = rentRows.reduce((s, b) => s + owed(b), 0) + utilityRows.reduce((s, b) => s + owed(b), 0);
  const truncated = rent.truncated || utility.truncated;

  return {
    fileName: exportFileName(ctx.dormName, "bills", manilaToday(), wanted || undefined),
    sheets: [
      defineSheet<(typeof rentRows)[number]>({
        name: "Rent bills",
        title: "Rent bills",
        subtitle: subtitleFor(ctx, filters, truncated),
        summary: [
          { label: "Total billed (rent and utilities)", value: money(billedTotal) },
          { label: "Total paid", value: money(paidTotal) },
          { label: "Still owed", value: money(owedTotal) },
        ],
        columns: [
          { header: "Tenant", width: 26, value: (b) => one(b.tenants)?.full_name },
          { header: "Room", width: 9, value: (b) => one(b.rooms)?.room_number },
          { header: "Billing period", width: 28, value: (b) => billingPeriod(b.billing_period_start, b.billing_period_end) },
          { header: "Due date", width: 14, type: "date", value: (b) => calendarDate(b.due_date) },
          { header: "Rent (₱)", width: 13, type: "money", total: true, value: (b) => Number(b.rent_amount) },
          { header: "Other charges (₱)", width: 14, type: "money", total: true, value: (b) => Number(b.other_charges) },
          { header: "Late fee (₱)", width: 12, type: "money", total: true, value: (b) => Number(b.late_fee) },
          { header: "Total (₱)", width: 13, type: "money", total: true, value: (b) => Number(b.total_amount) },
          { header: "Paid (₱)", width: 13, type: "money", total: true, value: (b) => Number(b.amount_paid) },
          { header: "Balance (₱)", width: 13, type: "money", total: true, value: (b) => owed(b) },
          { header: "Status", width: 11, value: (b) => statusLabels[b.shown] ?? b.shown },
          { header: "Invoice no.", width: 16, value: (b) => b.invoice_number },
        ],
        rows: rentRows,
        emptyMessage: "No rent bills match these filters.",
      }),
      defineSheet<(typeof utilityRows)[number]>({
        name: "Water & electricity",
        title: "Water & electricity bills",
        subtitle: subtitleFor(ctx, filters, truncated),
        columns: [
          { header: "Room", width: 9, value: (b) => one(b.rooms)?.room_number },
          { header: "Billing period", width: 28, value: (b) => billingPeriod(b.billing_period_start, b.billing_period_end) },
          { header: "Due date", width: 14, type: "date", value: (b) => calendarDate(b.due_date) },
          { header: "Water (₱)", width: 13, type: "money", total: true, value: (b) => Number(b.water_amount) },
          { header: "Electricity (₱)", width: 14, type: "money", total: true, value: (b) => Number(b.electricity_amount) },
          { header: "Total (₱)", width: 13, type: "money", total: true, value: (b) => Number(b.total_amount) },
          { header: "Paid (₱)", width: 13, type: "money", total: true, value: (b) => Number(b.amount_paid) },
          { header: "Balance (₱)", width: 13, type: "money", total: true, value: (b) => owed(b) },
          { header: "Status", width: 11, value: (b) => statusLabels[b.shown] ?? b.shown },
          { header: "Notes", width: 30, value: (b) => b.notes },
        ],
        rows: utilityRows,
        emptyMessage: "No water & electricity bills match these filters.",
      }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Tenants

type TenantRow = {
  id: string;
  profile_id: string | null;
  full_name: string;
  contact_number: string | null;
  status: string;
  move_in_date: string | null;
  move_out_date: string | null;
  rooms: { room_number: string } | { room_number: string }[] | null;
};

const tenantStatusLabels: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  moved_out: "Moved out",
};

async function tenantsExport(ctx: ExportContext): Promise<ExportResult> {
  const q = likeTerm(ctx.params.get("q") ?? "");
  const status = ctx.params.get("status") ?? "";
  const payment = ctx.params.get("payment") ?? "";

  const [tenants, unpaid] = await Promise.all([
    fetchAll<TenantRow>((a, b) => {
      let query = ctx.admin
        .from("tenants")
        .select("id, profile_id, full_name, contact_number, status, move_in_date, move_out_date, rooms(room_number)")
        .eq("dorm_id", ctx.dormId)
        .order("full_name")
        .order("id");
      if (q) query = query.ilike("full_name", `%${q}%`);
      if (tenantStatusLabels[status]) query = query.eq("status", status);
      return query.range(a, b);
    }),
    // What each tenant owes: from the unpaid bills only, as the Tenants page does.
    fetchAll<{ tenant_id: string; status: string; due_date: string; total_amount: number | string; amount_paid: number | string }>((a, b) =>
      ctx.admin
        .from("bills")
        .select("tenant_id, status, due_date, total_amount, amount_paid")
        .eq("dorm_id", ctx.dormId)
        .neq("status", "paid")
        .order("id")
        .range(a, b)
    ),
  ]);

  const balance = new Map<string, number>();
  for (const bill of unpaid.rows) {
    if (displayBillStatus(bill, ctx.graceDays) === "paid") continue;
    const owed = Math.max(0, Number(bill.total_amount) - Number(bill.amount_paid));
    balance.set(bill.tenant_id, (balance.get(bill.tenant_id) ?? 0) + owed);
  }

  const rows = tenants.rows.filter((t) => {
    const owes = (balance.get(t.id) ?? 0) > 0;
    if (payment === "unpaid") return owes;
    if (payment === "paid") return !owes;
    return true;
  });

  // Account emails, a batch at a time (a long list of ids would overflow the URL).
  const emailById = new Map<string, string>();
  const profileIds = [...new Set(rows.map((t) => t.profile_id).filter((id): id is string => Boolean(id)))];
  for (const ids of chunk(profileIds, 100)) {
    const { data, error } = await ctx.admin.from("users").select("id, email").in("id", ids);
    if (error) throw error;
    for (const u of data ?? []) emailById.set(u.id as string, u.email as string);
  }

  const filters = [
    tenantStatusLabels[status] ? `Status: ${tenantStatusLabels[status]}` : "All tenant statuses",
    payment === "unpaid" ? "With a balance" : payment === "paid" ? "No balance" : "All payment states",
    q ? `Name contains "${q}"` : null,
  ].filter(Boolean).join(" · ");

  return {
    fileName: exportFileName(ctx.dormName, "tenants", manilaToday(), tenantStatusLabels[status] ? status : undefined),
    sheets: [
      defineSheet<TenantRow>({
        name: "Tenants",
        title: "Tenants",
        subtitle: subtitleFor(ctx, filters, tenants.truncated || unpaid.truncated),
        summary: [
          { label: "Tenants listed", value: rows.length, money: false },
          { label: "Total balance owed", value: money(rows.reduce((s, t) => s + (balance.get(t.id) ?? 0), 0)) },
        ],
        columns: [
          { header: "Name", width: 28, value: (t) => t.full_name },
          { header: "Room", width: 9, value: (t) => one(t.rooms)?.room_number },
          { header: "Status", width: 12, value: (t) => tenantStatusLabels[t.status] ?? t.status },
          { header: "Contact number", width: 18, value: (t) => t.contact_number },
          { header: "Email", width: 30, value: (t) => (t.profile_id ? emailById.get(t.profile_id) : null) },
          { header: "Move-in date", width: 14, type: "date", value: (t) => calendarDate(t.move_in_date) },
          { header: "Move-out date", width: 14, type: "date", value: (t) => calendarDate(t.move_out_date) },
          { header: "Balance owed (₱)", width: 16, type: "money", total: true, value: (t) => money(balance.get(t.id) ?? 0) },
        ],
        rows,
        emptyMessage: "No tenants match these filters.",
      }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Rooms

type RoomRow = {
  id: string;
  room_number: string;
  capacity: number;
  monthly_rate: number | string;
  status: string;
};

const roomStatusLabels: Record<string, string> = {
  available: "Available",
  full: "Full",
  maintenance: "Under maintenance",
};

async function roomsExport(ctx: ExportContext): Promise<ExportResult> {
  const [rooms, occupants] = await Promise.all([
    fetchAll<RoomRow>((a, b) =>
      ctx.admin
        .from("rooms")
        .select("id, room_number, capacity, monthly_rate, status")
        .eq("dorm_id", ctx.dormId)
        .order("room_number")
        .order("id")
        .range(a, b)
    ),
    fetchAll<{ room_id: string | null; full_name: string }>((a, b) =>
      ctx.admin
        .from("tenants")
        .select("room_id, full_name")
        .eq("dorm_id", ctx.dormId)
        .eq("status", "active")
        .not("room_id", "is", null)
        .order("full_name")
        .order("id")
        .range(a, b)
    ),
  ]);

  const namesByRoom = new Map<string, string[]>();
  for (const t of occupants.rows) {
    if (!t.room_id) continue;
    namesByRoom.set(t.room_id, [...(namesByRoom.get(t.room_id) ?? []), t.full_name]);
  }

  const count = (r: RoomRow) => namesByRoom.get(r.id)?.length ?? 0;

  return {
    fileName: exportFileName(ctx.dormName, "rooms", manilaToday()),
    sheets: [
      defineSheet<RoomRow>({
        name: "Rooms",
        title: "Rooms & occupancy",
        subtitle: subtitleFor(ctx, "All rooms", rooms.truncated),
        columns: [
          { header: "Room", width: 10, value: (r) => r.room_number },
          { header: "Status", width: 18, value: (r) => roomStatusLabels[r.status] ?? r.status },
          { header: "Capacity (beds)", width: 15, type: "integer", total: true, value: (r) => r.capacity },
          { header: "Occupied", width: 11, type: "integer", total: true, value: (r) => count(r) },
          { header: "Vacant", width: 9, type: "integer", total: true, value: (r) => Math.max(0, r.capacity - count(r)) },
          { header: "Monthly rate (₱)", width: 16, type: "money", value: (r) => Number(r.monthly_rate) },
          { header: "Tenants", width: 50, value: (r) => (namesByRoom.get(r.id) ?? []).join(", ") },
        ],
        rows: rooms.rows,
        emptyMessage: "No rooms yet.",
      }),
    ],
  };
}

// ---------------------------------------------------------------------------

export async function buildExport(kind: ExportKind, ctx: ExportContext): Promise<ExportResult> {
  switch (kind) {
    case "payments":
      return paymentsExport(ctx);
    case "income-expenses":
      return incomeExpensesExport(ctx);
    case "bills":
      return billsExport(ctx);
    case "tenants":
      return tenantsExport(ctx);
    case "rooms":
      return roomsExport(ctx);
  }
}
