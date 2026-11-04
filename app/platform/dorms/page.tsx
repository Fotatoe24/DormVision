import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { LoadError } from "@/components/load-error";
import { EmptyState } from "@/components/empty-state";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { PaginationControls } from "@/components/pagination-controls";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-guard";
import { dormStatus, dormStatusLabels, dormStatusStyles } from "@/lib/dorm-status";
import {
  parsePage,
  getRange,
  getTotalPages,
  isPageOutOfRange,
  pageHref,
} from "@/lib/pagination";

export default async function PlatformDormsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requirePlatformAdmin();
  const { q, status, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);

  let query = createAdminClient()
    .from("dormitories")
    .select("id, name, join_code, created_at, approved_at, suspended_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id");

  if (q) query = query.ilike("name", `%${q.replace(/[%,()]/g, " ")}%`);
  if (status === "pending") query = query.is("approved_at", null).is("suspended_at", null);
  else if (status === "suspended") query = query.not("suspended_at", "is", null);
  else if (status === "active") query = query.not("approved_at", "is", null).is("suspended_at", null);

  const { from, to } = getRange(page);
  const { data, count, error } = await query.range(from, to);

  if (isPageOutOfRange(error)) redirect(pageHref("/platform/dorms", { q, status }, "page", 1));

  if (error) {
    console.error("Could not load dormitories:", error);
    return (
      <div className="mx-auto max-w-3xl">
        <LoadError what="dormitories" />
      </div>
    );
  }

  const dorms = data ?? [];
  const hasFilters = Boolean(q || status);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs text-foreground-muted">Platform admin</p>
        <h1 className="font-heading text-lg font-semibold text-primary">Dormitories</h1>
      </div>

      <AutoSubmitForm className="mb-4 flex flex-wrap gap-2" action="/platform/dorms">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by dormitory name..."
          className="min-w-[160px] flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Awaiting approval</option>
          <option value="suspended">Suspended</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
        >
          Search
        </button>
      </AutoSubmitForm>

      <div className="mb-3 text-xs text-foreground-muted">
        Showing {count ?? 0} dormitor{count === 1 ? "y" : "ies"}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {dorms.length > 0 ? (
          dorms.map((dorm, i) => {
            const state = dormStatus(dorm);
            return (
              <Link
                key={dorm.id}
                href={`/platform/dorms/${dorm.id}`}
                className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted ${
                  i < dorms.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{dorm.name}</p>
                  <p className="text-xs text-foreground-muted">
                    Created{" "}
                    {new Date(dorm.created_at).toLocaleDateString("en-PH", {
                      timeZone: "Asia/Manila",
                      dateStyle: "medium",
                    })}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${dormStatusStyles[state]}`}
                >
                  {dormStatusLabels[state]}
                </span>
              </Link>
            );
          })
        ) : (
          <EmptyState
            icon={Building2}
            title={hasFilters ? "No dormitories found" : "No dormitories yet"}
            description={
              hasFilters ? "Try a different search or filter." : "Dormitories appear here when an owner signs up."
            }
          />
        )}
      </div>

      <PaginationControls
        page={page}
        totalPages={getTotalPages(count ?? 0)}
        hrefForPage={(p) => pageHref("/platform/dorms", { q, status }, "page", p)}
      />
    </div>
  );
}
