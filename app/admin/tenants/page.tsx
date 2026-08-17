import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney, displayBillStatus } from "@/lib/billing";

const tenantStatusStyles: Record<string, string> = {
  active: "bg-status-paid/15 text-status-paid",
  inactive: "bg-status-unpaid/15 text-status-unpaid",
  moved_out: "bg-status-unpaid/15 text-status-unpaid",
};

const tenantStatusLabels: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  moved_out: "Moved out",
};

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role !== "owner") redirect("/tenant");

  const dormId = session.profile?.dorm_id;
  if (!dormId) redirect("/");

  const supabase = createAdminClient();

  let query = supabase
    .from("tenants")
    .select("id, profile_id, full_name, contact_number, status, room_id")
    .eq("dorm_id", dormId)
    .order("full_name");

  if (q) {
    query = query.ilike("full_name", `%${q}%`);
  }

  if (status && ["active", "inactive", "moved_out"].includes(status)) {
    query = query.eq("status", status);
  }

  const { data: tenants } = await query;

  const roomIds = Array.from(
    new Set(
      (tenants ?? [])
        .map((t) => t.room_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const { data: rooms } = roomIds.length
    ? await supabase.from("rooms").select("id, room_number").in("id", roomIds)
    : { data: [] };

  const roomNumberById = new Map(
    (rooms ?? []).map((r) => [r.id, r.room_number])
  );

  const tenantIds = (tenants ?? []).map((t) => t.id);

  const { data: bills } = tenantIds.length
    ? await supabase
        .from("bills")
        .select("tenant_id, status, due_date, total_amount, amount_paid")
        .in("tenant_id", tenantIds)
    : { data: [] };

  const balanceByTenant = new Map<string, number>();
  for (const bill of bills ?? []) {
    const displayStatus = displayBillStatus(bill);
    if (displayStatus === "paid") continue;
    const remaining = Number(bill.total_amount) - Number(bill.amount_paid);
    balanceByTenant.set(
      bill.tenant_id,
      (balanceByTenant.get(bill.tenant_id) ?? 0) + remaining
    );
  }

  const hasFilters = Boolean(q || status);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs text-foreground-muted">Owner dashboard</p>
        <h1 className="font-heading text-lg font-semibold text-primary">
          Tenants
        </h1>
      </div>

      {/* Search + filter */}
      <form className="mb-4 flex flex-wrap gap-2" action="/admin/tenants">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name…"
          className="min-w-[160px] flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="moved_out">Moved out</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
        >
          Search
        </button>
      </form>

      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {tenants && tenants.length > 0 ? (
          <div>
            {tenants.map((t, i) => {
              const balance = balanceByTenant.get(t.id) ?? 0;
              const roomNumber = t.room_id
                ? roomNumberById.get(t.room_id)
                : null;

              return (
                <Link
                  key={t.id}
                  href={`/admin/tenants/${t.id}`}
                  className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted ${
                    i < tenants.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t.full_name}</p>
                    <p className="text-xs text-foreground-muted">
                      {roomNumber ? `Room ${roomNumber}` : "Unassigned"}
                      {t.contact_number ? ` · ${t.contact_number}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={`font-mono text-sm ${
                        balance > 0
                          ? "text-status-overdue"
                          : "text-foreground-muted"
                      }`}
                    >
                      {balance > 0 ? formatMoney(balance) : "—"}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        tenantStatusStyles[t.status] ?? ""
                      }`}
                    >
                      {tenantStatusLabels[t.status] ?? t.status}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">No tenants found</p>
            <p className="mt-1 text-xs text-foreground-muted">
              {hasFilters
                ? "Try a different search or filter."
                : "Tenants will show up here once they join with your Dorm ID."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
