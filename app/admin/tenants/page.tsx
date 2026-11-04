import { LoadError } from "@/components/load-error";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney, displayBillStatus } from "@/lib/billing";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/empty-state";
import { Users } from "lucide-react";
import { PaginationControls } from "@/components/pagination-controls";
import {
  parsePage,
  getRange,
  getTotalPages,
  isPageOutOfRange,
  pageHref,
} from "@/lib/pagination";

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
  searchParams: Promise<{
    q?: string;
    status?: string;
    payment?: string;
    page?: string;
  }>;
}) {
  const { q, status, payment, page: pageParam } = await searchParams;

  const page = parsePage(pageParam);
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role !== "owner") redirect("/tenant");

  const dormId = session.profile?.dorm_id;
  if (!dormId) redirect("/");

  const supabase = createAdminClient();

  // Everyone's outstanding balance, from the dorm's UNPAID bills only: a paid
  // bill owes nothing, and this keeps the page's cost independent of how many
  // bills have ever been issued.
  const { data: unpaidBills, error: billsError } = await supabase
    .from("bills")
    .select("tenant_id, status, due_date, total_amount, amount_paid")
    .eq("dorm_id", dormId)
    .neq("status", "paid");

  if (billsError) {
    console.error("Could not load bills:", billsError);
    return (
      <div className="mx-auto max-w-3xl">
        <LoadError what="bills" />
      </div>
    );
  }

  const balanceByTenant = new Map<string, number>();

  for (const bill of unpaidBills ?? []) {
    if (displayBillStatus(bill) === "paid") continue;

    const remaining = Math.max(
      0,
      Number(bill.total_amount) - Number(bill.amount_paid)
    );

    balanceByTenant.set(
      bill.tenant_id,
      (balanceByTenant.get(bill.tenant_id) ?? 0) + remaining
    );
  }

  const owingIds = [...balanceByTenant.entries()]
    .filter(([, balance]) => balance > 0)
    .map(([id]) => id);

  // One PAGE of tenants, filtered and counted by the database. (Moved-out
  // tenants are kept forever, so this list only ever grows; it used to load
  // every tenant and slice the page out in memory.)
  let query = supabase
    .from("tenants")
    .select("id, profile_id, full_name, contact_number, status, room_id", {
      count: "exact",
    })
    .eq("dorm_id", dormId)
    // The id breaks ties between people with the same name: without a unique
    // sort key a row can repeat or vanish at a page boundary.
    .order("full_name")
    .order("id");

  if (q) {
    query = query.ilike("full_name", `%${q}%`);
  }

  if (status && ["active", "inactive", "moved_out"].includes(status)) {
    query = query.eq("status", status);
  }

  // "Unpaid" = has a balance; "Paid" = everyone else (including people who
  // have never been billed), exactly as the old in-memory filter decided.
  if (payment === "unpaid") {
    query = query.in("id", owingIds);
  } else if (payment === "paid" && owingIds.length > 0) {
    query = query.not("id", "in", `(${owingIds.join(",")})`);
  }

  const { from, to } = getRange(page);
  const {
    data: pageTenants,
    count: matchingCount,
    error: tenantsError,
  } = await query.range(from, to);

  // A stale bookmark or a hand-typed ?page=99: back to the first page.
  if (isPageOutOfRange(tenantsError)) {
    redirect(pageHref("/admin/tenants", { q, status, payment }, "page", 1));
  }

  if (tenantsError) {
    console.error("Could not load tenants:", tenantsError);
    return (
      <div className="mx-auto max-w-3xl">
        <LoadError what="tenants" />
      </div>
    );
  }

  const tenants = pageTenants ?? [];
  const totalPages = getTotalPages(matchingCount ?? 0);

  // Fetch room numbers only for the tenants on the current page.
  const roomIds = Array.from(
    new Set(
      tenants.map((t) => t.room_id).filter((id): id is string => Boolean(id))
    )
  );

  const { data: rooms, error: roomsError } = roomIds.length
    ? await supabase.from("rooms").select("id, room_number").in("id", roomIds)
    : { data: [], error: null };

  if (roomsError) {
    console.error("Could not load rooms:", roomsError);
    return (
      <div className="mx-auto max-w-3xl">
        <LoadError what="rooms" />
      </div>
    );
  }

  const roomNumberById = new Map(
    (rooms ?? []).map((r) => [r.id, r.room_number])
  );

  const hasFilters = Boolean(q || status || payment);

  // Only needed for the first-run empty state below: the Dorm ID is what a
  // tenant signs up with, so surface it right where the owner would look.
  const { data: dormForCode } =
    tenants.length === 0 && !hasFilters
      ? await supabase
          .from("dormitories")
          .select("join_code")
          .eq("id", dormId)
          .maybeSingle()
      : { data: null };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs text-foreground-muted">Owner dashboard</p>
        <h1 className="font-heading text-lg font-semibold text-primary">
          Tenants
        </h1>
      </div>

      {/* Search + tenant and payment filters */}
      <AutoSubmitForm
        className="mb-4 flex flex-wrap gap-2"
        action="/admin/tenants"
      >
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name..."
          className="min-w-[160px] flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
        />

        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">All tenant statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="moved_out">Moved out</option>
        </select>

        <select
          name="payment"
          defaultValue={payment ?? ""}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">All Statuses</option>
          <option value="paid">Paid Only</option>
          <option value="unpaid">Unpaid Only</option>
        </select>

        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
        >
          Search
        </button>
      </AutoSubmitForm>

      <div className="mb-3 text-xs text-foreground-muted">
        Showing {matchingCount ?? 0} tenant
        {matchingCount !== 1 ? "s" : ""}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {tenants.length > 0 ? (
          <div>
            {tenants.map((t, i) => {
              const balance = balanceByTenant.get(t.id) ?? 0;
              const roomNumber = t.room_id
                ? roomNumberById.get(t.room_id)
                : null;

              const isPaid = balance === 0;

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
                    <div className="text-right">
                      <p
                        className={`font-mono text-sm ${
                          balance > 0
                            ? "text-status-overdue"
                            : "text-foreground-muted"
                        }`}
                      >
                        {balance > 0 ? formatMoney(balance) : "—"}
                      </p>

                      <span
                        className={`text-xs font-medium ${
                          isPaid ? "text-status-paid" : "text-status-unpaid"
                        }`}
                      >
                        {isPaid ? "Paid" : "Unpaid"}
                      </span>
                    </div>

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
          <EmptyState
            icon={Users}
            title={hasFilters ? "No tenants found" : "No tenants yet"}
            description={
              hasFilters
                ? "Try a different search or filter."
                : "Share your Dorm ID with tenants. They sign up with it and appear here once you approve their request."
            }
            action={
              hasFilters
                ? undefined
                : { label: "Review requests", href: "/admin/tenant-requests" }
            }
          >
            {!hasFilters && dormForCode?.join_code && (
              <CopyButton value={dormForCode.join_code} label="Copy Dorm ID" />
            )}
          </EmptyState>
        )}
      </div>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        hrefForPage={(p) => {
          const params = new URLSearchParams();

          if (q) params.set("q", q);
          if (status) params.set("status", status);
          if (payment) params.set("payment", payment);
          if (p > 1) params.set("page", String(p));

          const qs = params.toString();

          return qs ? `/admin/tenants?${qs}` : "/admin/tenants";
        }}
      />
    </div>
  );
}
