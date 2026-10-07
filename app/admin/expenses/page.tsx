import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/lib/actions";
import { formatMoney } from "@/lib/billing";
import { TransactionModal } from "@/components/transaction-modal";
import { TransactionRowMenu } from "@/components/transaction-row-menu";
import { IncomeExpenseChart } from "@/components/income-expense-chart";
import { ExpenseBreakdownDonut } from "@/components/expense-breakdown-donut";
import { Plus } from "lucide-react";

const categoryLabels: Record<string, string> = {
  rent: "Rent",
  other_income: "Other income",
  utilities: "Utilities",
  repairs: "Repairs & maintenance",
  supplies: "Supplies",
  other_expense: "Other expense",
};

// Matches components/expense-breakdown-donut.tsx's CATEGORY_COLORS --
// accent and status-partial are both amber/gold in this palette and
// read as near-identical side by side, so utilities/repairs use
// status-overdue/accent instead for a genuinely distinguishable set.
const categoryDotClass: Record<string, string> = {
  rent: "bg-status-paid",
  other_income: "bg-status-paid",
  utilities: "bg-status-overdue",
  repairs: "bg-accent",
  supplies: "bg-status-unpaid",
  other_expense: "bg-foreground-muted",
};

// Written out in full (not built from categoryDotClass + "/15") so
// every class Tailwind needs to generate appears literally here.
const categoryPillClass: Record<string, string> = {
  rent: "bg-status-paid/15",
  other_income: "bg-status-paid/15",
  utilities: "bg-status-overdue/15",
  repairs: "bg-accent/15",
  supplies: "bg-status-unpaid/15",
  other_expense: "bg-foreground-muted/15",
};

const RANGES = ["this_month", "last_month", "ytd"] as const;
type Range = (typeof RANGES)[number];

const rangeLabels: Record<Range, string> = {
  this_month: "This Month",
  last_month: "Last Month",
  ytd: "Year to Date",
};

function getPeriodBounds(range: Range) {
  const now = new Date();

  if (range === "last_month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 1),
    };
  }

  if (range === "ytd") {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }

  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
}

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type FeedRow = {
  id: string;
  kind: "payment" | "transaction";
  type: "income" | "expense";
  category: string;
  title: string;
  subtitle: string;
  amount: number;
  date: string;
  editValues?: {
    id: string;
    type: "income" | "expense";
    category: string;
    amount: string;
    description: string;
    occurredAt: string;
  };
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    range?: string;
    category?: string;
    q?: string;
  }>;
}) {
  const {
    error,
    saved,
    range: rangeParam,
    category: categoryFilter,
    q,
  } = await searchParams;

  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role !== "owner") redirect("/tenant");

  const dormId = session.profile?.dorm_id;
  if (!dormId) redirect("/");

  const range: Range = RANGES.includes(rangeParam as Range)
    ? (rangeParam as Range)
    : "this_month";

  const supabase = createAdminClient();

  // ------------------------------------------------------------
  // Tenants for this dorm -- builds the tenant_id -> name/room map
  // used to label payment-sourced ("Rent") feed rows. Payments has no
  // dorm_id column of its own, same reasoning as app/admin/payments.
  // ------------------------------------------------------------
  const { data: tenants, error: tenantsError } = await supabase
    .from("tenants")
    .select("id, full_name, room_id, rooms(room_number)")
    .eq("dorm_id", dormId);

  const tenantIds = (tenants ?? []).map((t) => t.id);

  const tenantInfoById = new Map(
    (tenants ?? []).map((t) => {
      const roomRel = t.rooms as
        | { room_number: string }
        | { room_number: string }[]
        | null;
      const room = Array.isArray(roomRel) ? roomRel[0] : roomRel;
      return [t.id, { name: t.full_name, roomNumber: room?.room_number }];
    })
  );

  // ------------------------------------------------------------
  // All-time transactions + confirmed payments -- fetched once,
  // sliced in memory for the 6-month trend chart, the selected
  // period's summary/donut/list, and the category/search filters.
  // Small-dorm scale (same assumption app/admin/payments already
  // makes by fetching its full history unpaginated).
  // ------------------------------------------------------------
  const [{ data: transactions, error: transactionsError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("id, type, category, amount, description, occurred_at")
        .eq("dorm_id", dormId)
        .order("occurred_at", { ascending: false }),
      tenantIds.length
        ? supabase
            .from("payments")
            .select("id, amount, paid_at, tenant_id")
            .eq("status", "confirmed")
            .in("tenant_id", tenantIds)
            .order("paid_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

  const loadError =
    tenantsError?.message ||
    transactionsError?.message ||
    paymentsError?.message ||
    null;

  if (loadError) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="rounded-lg border border-status-overdue/30 bg-status-overdue/10 px-4 py-3 text-sm text-status-overdue">
          Could not load income & expenses: {loadError}
        </div>
      </div>
    );
  }

  const transactionRows = transactions ?? [];
  const paymentRows = payments ?? [];

  // ------------------------------------------------------------
  // Selected-period slice
  // ------------------------------------------------------------
  const { start, end } = getPeriodBounds(range);

  const periodTransactions = transactionRows.filter((t) => {
    const d = new Date(t.occurred_at + "T00:00:00");
    return d >= start && d < end;
  });

  const periodPayments = paymentRows.filter((p) => {
    const d = new Date(p.paid_at);
    return d >= start && d < end;
  });

  // Total income includes rent (confirmed payments), matching the
  // same formula used on the Overview and Monitoring pages -- see
  // app/admin/page.tsx's "Financial summary" comment for why
  // transactions never carries a 'rent' category of its own.
  const periodTxIncome = periodTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const periodPaymentIncome = periodPayments.reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );
  const totalIncome = periodTxIncome + periodPaymentIncome;

  const totalExpense = periodTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const net = totalIncome - totalExpense;

  // ------------------------------------------------------------
  // Expense breakdown (donut) -- this period's expense transactions,
  // grouped by category. Rent is always income, never appears here.
  // ------------------------------------------------------------
  const expenseByCategory = new Map<string, number>();
  for (const t of periodTransactions) {
    if (t.type !== "expense") continue;
    expenseByCategory.set(
      t.category,
      (expenseByCategory.get(t.category) ?? 0) + Number(t.amount)
    );
  }
  const donutData = Array.from(expenseByCategory.entries()).map(
    ([category, amount]) => ({
      category,
      label: categoryLabels[category] ?? category,
      amount,
    })
  );

  // ------------------------------------------------------------
  // 6-month income vs expenses trend -- independent of the selected
  // period, same reusable chart as the Overview page.
  // ------------------------------------------------------------
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const offset = 5 - i;
    const mStart = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const mEnd = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    return {
      start: mStart,
      end: mEnd,
      label: mStart.toLocaleDateString("en-PH", { month: "short", year: "2-digit" }),
    };
  });

  const monthlyTrend = months.map(({ start: mStart, end: mEnd, label }) => {
    const income =
      paymentRows
        .filter((p) => {
          const d = new Date(p.paid_at);
          return d >= mStart && d < mEnd;
        })
        .reduce((sum, p) => sum + Number(p.amount), 0) +
      transactionRows
        .filter((t) => {
          if (t.type !== "income") return false;
          const d = new Date(t.occurred_at + "T00:00:00");
          return d >= mStart && d < mEnd;
        })
        .reduce((sum, t) => sum + Number(t.amount), 0);

    const expenses = transactionRows
      .filter((t) => {
        if (t.type !== "expense") return false;
        const d = new Date(t.occurred_at + "T00:00:00");
        return d >= mStart && d < mEnd;
      })
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return { label, income, expenses };
  });

  // ------------------------------------------------------------
  // Unified feed for the list -- confirmed rent payments and logged
  // transactions, merged and sorted by date.
  // ------------------------------------------------------------
  const feed: FeedRow[] = [
    ...periodPayments.map((p): FeedRow => {
      const info = tenantInfoById.get(p.tenant_id);
      return {
        id: `payment-${p.id}`,
        kind: "payment",
        type: "income",
        category: "rent",
        title: info?.name ?? "Unknown tenant",
        subtitle: `${info?.roomNumber ? `Room ${info.roomNumber} · ` : ""}${formatDateTime(p.paid_at)}`,
        amount: Number(p.amount),
        date: p.paid_at,
      };
    }),
    ...periodTransactions.map((t): FeedRow => ({
      id: `transaction-${t.id}`,
      kind: "transaction",
      type: t.type as "income" | "expense",
      category: t.category,
      title: categoryLabels[t.category] ?? t.category,
      subtitle: `${formatDate(t.occurred_at)}${t.description ? ` · ${t.description}` : ""}`,
      amount: Number(t.amount),
      date: t.occurred_at,
      editValues: {
        id: t.id,
        type: t.type as "income" | "expense",
        category: t.category,
        amount: String(t.amount),
        description: t.description ?? "",
        occurredAt: t.occurred_at,
      },
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const needle = (q ?? "").trim().toLowerCase();

  const displayFeed = feed.filter((row) => {
    if (categoryFilter && categoryFilter !== "all" && row.category !== categoryFilter) {
      return false;
    }
    if (needle) {
      const haystack = `${row.title} ${row.subtitle}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  function rangeHref(r: Range) {
    const params = new URLSearchParams();
    params.set("range", r);
    if (categoryFilter) params.set("category", categoryFilter);
    if (q) params.set("q", q);
    return `/admin/expenses?${params.toString()}`;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-foreground-muted">Owner dashboard</p>
          <h1 className="font-heading text-lg font-semibold text-primary">
            Income &amp; Expenses
          </h1>
        </div>

        <TransactionModal
          title="Add transaction"
          action={createTransaction}
          trigger={
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Add Transaction
            </button>
          }
        />
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-status-overdue/30 bg-status-overdue/10 px-3 py-2 text-xs text-status-overdue">
          {error}
        </div>
      )}

      {saved && (
        <div className="mb-4 rounded-md border border-status-paid/30 bg-status-paid/10 px-3 py-2 text-xs text-status-paid">
          Saved.
        </div>
      )}

      {/* Summary */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-foreground-muted">Income</p>
          <p className="mt-1 font-mono text-lg font-semibold text-status-paid">
            {formatMoney(totalIncome)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-foreground-muted">Expenses</p>
          <p className="mt-1 font-mono text-lg font-semibold text-status-overdue">
            {formatMoney(totalExpense)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-foreground-muted">Net</p>
          <p
            className={`mt-1 font-mono text-lg font-semibold ${
              net >= 0 ? "text-status-paid" : "text-status-overdue"
            }`}
          >
            {formatMoney(net)}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-1 font-heading text-sm font-semibold">
            Monthly Trends
          </p>
          <p className="mb-4 text-xs text-foreground-muted">Last 6 months</p>
          <IncomeExpenseChart data={monthlyTrend} />
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-1 font-heading text-sm font-semibold">
            Expense Breakdown
          </p>
          <p className="mb-4 text-xs text-foreground-muted">
            {rangeLabels[range]}
          </p>
          <ExpenseBreakdownDonut data={donutData} />
        </div>
      </div>

      {/* Category filter + search */}
      <form
        className="mb-3 flex flex-wrap gap-2"
        action="/admin/expenses"
      >
        <input type="hidden" name="range" value={range} />
        <select
          name="category"
          defaultValue={categoryFilter ?? "all"}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="all">All categories</option>
          {Object.entries(categoryLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search entries by text"
          className="min-w-[200px] flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <button
          type="submit"
          className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground"
        >
          Filter
        </button>
      </form>

      {/* Time range */}
      <div className="mb-4 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={rangeHref(r)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              r === range
                ? "bg-primary text-surface"
                : "border border-border bg-surface text-foreground-muted hover:text-foreground"
            }`}
          >
            {rangeLabels[r]}
          </Link>
        ))}
      </div>

      {/* List */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {displayFeed.length > 0 ? (
          <div>
            {displayFeed.map((row, i) => (
              <div
                key={row.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${
                  i < displayFeed.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  <p className="truncate text-xs text-foreground-muted">
                    {row.subtitle}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`hidden items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline-flex ${categoryPillClass[row.category] ?? "bg-foreground-muted/15"}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${categoryDotClass[row.category] ?? "bg-foreground-muted"}`}
                    />
                    {categoryLabels[row.category] ?? row.category}
                  </span>

                  <span
                    className={`font-mono text-sm ${
                      row.type === "income"
                        ? "text-status-paid"
                        : "text-status-overdue"
                    }`}
                  >
                    {row.type === "income" ? "+" : "-"}
                    {formatMoney(row.amount)}
                  </span>

                  {row.editValues && (
                    <TransactionRowMenu
                      values={row.editValues}
                      updateAction={updateTransaction}
                      deleteAction={deleteTransaction}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-foreground-muted">
            {feed.length === 0
              ? "No activity in this period yet."
              : "Nothing matches your filter."}
          </p>
        )}
      </div>
    </div>
  );
}
