import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { LoadError } from "@/components/load-error";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-guard";
import {
  parsePage,
  getRange,
  getTotalPages,
  isPageOutOfRange,
  pageHref,
} from "@/lib/pagination";

const PAGE_SIZE = 20;

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePlatformAdmin();
  const page = parsePage((await searchParams).page);
  const { from, to } = getRange(page, PAGE_SIZE);

  const { data, count, error } = await createAdminClient()
    .from("audit_log")
    .select("id, created_at, actor_email, action, target_label, reason, ip", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to);

  if (isPageOutOfRange(error)) redirect("/platform/audit");

  if (error) {
    console.error("Could not load the audit log:", error);
    return (
      <div className="mx-auto max-w-3xl">
        <LoadError what="the audit log" />
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs text-foreground-muted">Platform admin</p>
        <h1 className="font-heading text-lg font-semibold text-primary">Audit log</h1>
        <p className="mt-1 text-xs text-foreground-muted">
          Every admin action and sign-in. Entries can&apos;t be edited or deleted.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {rows.length > 0 ? (
          rows.map((row, i) => (
            <div
              key={row.id}
              className={`px-4 py-3 ${i < rows.length - 1 ? "border-b border-border" : ""}`}
            >
              <p className="text-sm text-foreground">
                <span className="font-mono text-xs">{row.action}</span>
                {row.target_label ? ` · ${row.target_label}` : ""}
              </p>
              {row.reason && <p className="text-xs text-foreground">Reason: {row.reason}</p>}
              <p className="text-xs text-foreground-muted">
                {new Date(row.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} ·{" "}
                {row.actor_email}
                {row.ip ? ` · ${row.ip}` : ""}
              </p>
            </div>
          ))
        ) : (
          <EmptyState icon={ScrollText} title="Nothing recorded yet" description="Admin actions will appear here." />
        )}
      </div>

      <PaginationControls
        page={page}
        totalPages={getTotalPages(count ?? 0, PAGE_SIZE)}
        hrefForPage={(p) => pageHref("/platform/audit", {}, "page", p)}
      />
    </div>
  );
}
