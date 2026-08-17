import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatPaymentDate } from "@/lib/billing";

const methodLabels: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  gcash: "GCash",
  other: "Other",
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    method?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { q, method, from, to } = await searchParams;

  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role !== "owner") redirect("/tenant");

  const dormId = session.profile?.dorm_id;
  if (!dormId) redirect("/");

  const supabase = createAdminClient();

  // Payments has no dorm_id column of its own -- scope through
  // tenants.dorm_id, same pattern as the dashboard and billing pages.
  const { data: tenants, error: tenantsError } = await supabase
    .from("tenants")
    .select("id, full_name")
    .eq("dorm_id", dormId);

  if (tenantsError) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-lg border border-status-overdue/30 bg-status-overdue/10 px-4 py-3 text-sm text-status-overdue">
          Could not load payments: {tenantsError.message}
        </div>
      </div>
    );
  }

  const nameById = new Map((tenants ?? []).map((t) => [t.id, t.full_name]));

  let tenantIds = (tenants ?? []).map((t) => t.id);

  if (q) {
    const needle = q.toLowerCase();
    tenantIds = tenantIds.filter((id) =>
      (nameById.get(id) ?? "").toLowerCase().includes(needle)
    );
  }

  let paymentsQuery = supabase
    .from("payments")
    .select("id, tenant_id, amount, method, paid_at, notes")
    .order("paid_at", { ascending: false });

  if (method && ["cash", "bank_transfer", "gcash", "other"].includes(method)) {
    paymentsQuery = paymentsQuery.eq("method", method);
  }

  if (from) {
    paymentsQuery = paymentsQuery.gte("paid_at", `${from}T00:00:00`);
  }

  if (to) {
    paymentsQuery = paymentsQuery.lte("paid_at", `${to}T23:59:59`);
  }

  const { data: payments, error: paymentsError } = tenantIds.length
    ? await paymentsQuery.in("tenant_id", tenantIds)
    : { data: [], error: null };

  if (paymentsError) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-lg border border-status-overdue/30 bg-status-overdue/10 px-4 py-3 text-sm text-status-overdue">
          Could not load payments: {paymentsError.message}
        </div>
      </div>
    );
  }

  const total = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const hasFilters = Boolean(q || method || from || to);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs text-foreground-muted">Owner dashboard</p>
        <h1 className="font-heading text-lg font-semibold text-primary">
          Payments
        </h1>
        <p className="text-xs text-foreground-muted">
          {(payments ?? []).length} payment(s) totalling {formatMoney(total)}
        </p>
      </div>

      {/* Search + filter */}
      <form
        className="mb-4 flex flex-wrap gap-2"
        action="/admin/payments"
      >
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by tenant…"
          className="min-w-[160px] flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <select
          name="method"
          defaultValue={method ?? ""}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">All methods</option>
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="gcash">GCash</option>
          <option value="other">Other</option>
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
          Search
        </button>
      </form>

      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {payments && payments.length > 0 ? (
          <div>
            {payments.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${
                  i < payments.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {nameById.get(p.tenant_id) ?? "Unknown tenant"}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {formatPaymentDate(p.paid_at)} ·{" "}
                    {methodLabels[p.method] ?? p.method}
                    {p.notes ? ` · ${p.notes}` : ""}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm text-status-paid">
                  {formatMoney(p.amount)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">No payments found</p>
            <p className="mt-1 text-xs text-foreground-muted">
              {hasFilters
                ? "Try a different search or filter."
                : "Payments will show up here once you record one on the Billing page."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
