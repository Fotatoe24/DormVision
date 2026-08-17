import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTransaction, deleteTransaction } from "@/lib/actions";
import { formatMoney } from "@/lib/billing";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";
const labelClass = "mb-1.5 block text-xs font-medium text-foreground-muted";

const categoryLabels: Record<string, string> = {
  rent: "Rent",
  other_income: "Other income",
  utilities: "Utilities",
  repairs: "Repairs & maintenance",
  supplies: "Supplies",
  other_expense: "Other expense",
};

const categoryOptions = [
  { group: "Income", options: ["rent", "other_income"] },
  {
    group: "Expense",
    options: ["utilities", "repairs", "supplies", "other_expense"],
  },
];

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    type?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { error, saved, type, from, to } = await searchParams;

  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role !== "owner") redirect("/tenant");

  const dormId = session.profile?.dorm_id;
  if (!dormId) redirect("/");

  const supabase = createAdminClient();

  let query = supabase
    .from("transactions")
    .select("id, type, category, amount, description, occurred_at")
    .eq("dorm_id", dormId)
    .order("occurred_at", { ascending: false });

  if (type === "income" || type === "expense") {
    query = query.eq("type", type);
  }

  if (from) {
    query = query.gte("occurred_at", from);
  }

  if (to) {
    query = query.lte("occurred_at", to);
  }

  const { data: transactions, error: transactionsError } = await query;

  if (transactionsError) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-lg border border-status-overdue/30 bg-status-overdue/10 px-4 py-3 text-sm text-status-overdue">
          Could not load transactions: {transactionsError.message}
        </div>
      </div>
    );
  }

  const totalIncome = (transactions ?? [])
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalExpense = (transactions ?? [])
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const net = totalIncome - totalExpense;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs text-foreground-muted">Owner dashboard</p>
        <h1 className="font-heading text-lg font-semibold text-primary">
          Expenses
        </h1>
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
      <div className="mb-6 grid grid-cols-3 gap-3">
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

      {/* Add transaction */}
      <details className="mb-6 rounded-lg border border-border bg-surface p-6">
        <summary className="cursor-pointer font-heading text-sm font-semibold">
          Add income or expense
        </summary>

        <form action={createTransaction} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="type" className={labelClass}>
                Type
              </label>
              <select
                id="type"
                name="type"
                required
                defaultValue="expense"
                className={inputClass}
              >
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>

            <div>
              <label htmlFor="category" className={labelClass}>
                Category
              </label>
              <select
                id="category"
                name="category"
                required
                defaultValue=""
                className={inputClass}
              >
                <option value="" disabled>
                  Select a category…
                </option>
                {categoryOptions.map((group) => (
                  <optgroup key={group.group} label={group.group}>
                    {group.options.map((c) => (
                      <option key={c} value={c}>
                        {categoryLabels[c]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="amount" className={labelClass}>
                Amount
              </label>
              <input
                id="amount"
                name="amount"
                type="number"
                min={0}
                step="0.01"
                required
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label htmlFor="occurredAt" className={labelClass}>
                Date
              </label>
              <input
                id="occurredAt"
                name="occurredAt"
                type="date"
                required
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="description" className={labelClass}>
              Description (optional)
            </label>
            <input
              id="description"
              name="description"
              type="text"
              placeholder="e.g. Electric bill for March"
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
          >
            Add transaction
          </button>
        </form>
      </details>

      {/* Filter */}
      <form className="mb-4 flex flex-wrap gap-2" action="/admin/expenses">
        <select
          name="type"
          defaultValue={type ?? ""}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <input
          type="date"
          name="from"
          defaultValue={from ?? ""}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
        <input
          type="date"
          name="to"
          defaultValue={to ?? ""}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
        >
          Filter
        </button>
      </form>

      {/* List */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {transactions && transactions.length > 0 ? (
          <div>
            {transactions.map((t, i) => (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${
                  i < transactions.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {categoryLabels[t.category] ?? t.category}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {formatDate(t.occurred_at)}
                    {t.description ? ` · ${t.description}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`font-mono text-sm ${
                      t.type === "income"
                        ? "text-status-paid"
                        : "text-status-overdue"
                    }`}
                  >
                    {t.type === "income" ? "+" : "-"}
                    {formatMoney(t.amount)}
                  </span>
                  <form action={deleteTransaction}>
                    <input type="hidden" name="transactionId" value={t.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-status-overdue/30 px-2.5 py-1 text-xs text-status-overdue hover:bg-status-overdue/10"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-foreground-muted">
            No transactions yet — add your first one above.
          </p>
        )}
      </div>
    </div>
  );
}
