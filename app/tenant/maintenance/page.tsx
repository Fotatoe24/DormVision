import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitMaintenanceRequest } from "@/lib/actions";
import { getMaintenanceSettings } from "@/lib/maintenance-settings";
import { getTenantAccessState } from "@/lib/tenant-status";
import { RegistrationStatus } from "@/components/registration-status";
import { PaginationControls } from "@/components/pagination-controls";
import { parsePage, getRange, getTotalPages } from "@/lib/pagination";
import {
  Wrench,
  Plus,
  Clock,
  ClipboardCheck,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";
const labelClass = "mb-1 block text-xs font-medium text-foreground-muted";

const statusStyles: Record<string, string> = {
  pending: "bg-status-partial/15 text-status-partial",
  acknowledged: "bg-accent/15 text-accent",
  in_progress: "bg-accent/15 text-accent",
  completed: "bg-status-paid/15 text-status-paid",
  rejected: "bg-status-overdue/15 text-status-overdue",
};

const statusIcons: Record<string, typeof Clock> = {
  pending: Clock,
  acknowledged: ClipboardCheck,
  in_progress: Loader2,
  completed: CheckCircle2,
  rejected: XCircle,
};

type RequestRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
};

export default async function TenantMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; page?: string }>;
}) {
  const { error, saved, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role !== "tenant") redirect("/admin");

  // Same access gate as Home and Billing -- a moved-out (or still
  // pending/rejected) tenant shouldn't be able to file new maintenance
  // requests for a room they no longer occupy.
  const accessState = await getTenantAccessState(
    session.user.id,
    session.profile?.dorm_id ?? null
  );

  if (accessState.status !== "approved") {
    return (
      <RegistrationStatus state={accessState} error={error} saved={saved} />
    );
  }

  const supabase = createAdminClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, dorm_id")
    .eq("profile_id", session.user.id)
    .maybeSingle();

  const { allowRequests } = await getMaintenanceSettings(tenant?.dorm_id);

  const { from, to } = getRange(page);

  const { data: requests, count } = tenant
    ? await supabase
        .from("maintenance_requests")
        .select("id, title, description, status, created_at", { count: "exact" })
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false })
        .range(from, to)
    : { data: [], count: 0 };

  const totalPages = getTotalPages(count ?? 0);
  const requestRows = (requests as RequestRow[] | null) ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Wrench className="h-4 w-4" />
        </span>
        <div>
          <h1 className="font-heading text-base font-semibold text-foreground">
            Maintenance
          </h1>
          <p className="text-xs text-foreground-muted">
            {count ?? 0} request{(count ?? 0) === 1 ? "" : "s"} · report an
            issue with your room or the dorm
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-status-overdue/30 bg-status-overdue/10 px-3 py-2 text-xs text-status-overdue">
          {error}
        </div>
      )}
      {saved && (
        <div className="mb-4 rounded-md border border-status-paid/30 bg-status-paid/10 px-3 py-2 text-xs text-status-paid">
          {saved}
        </div>
      )}

      {allowRequests ? (
        <form
          action={submitMaintenanceRequest}
          className="mb-5 rounded-lg border border-border bg-surface p-4"
        >
          <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            <Plus className="h-3.5 w-3.5 text-primary" />
            New request
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="title" className={labelClass}>
                What&apos;s wrong?
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                placeholder="Leaking faucet"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="description" className={labelClass}>
                Details (optional)
              </label>
              <textarea
                id="description"
                name="description"
                rows={2}
                placeholder="Bathroom sink drips constantly, worse at night."
                className={inputClass}
              />
            </div>
          </div>

          <button
            type="submit"
            className="mt-3 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-surface transition-opacity hover:opacity-90"
          >
            Submit request
          </button>
        </form>
      ) : (
        <div className="mb-5 rounded-lg border border-border bg-surface px-4 py-3 text-xs text-foreground-muted">
          Your dorm owner isn&apos;t accepting new maintenance requests right
          now. Your earlier requests are still listed below.
        </div>
      )}

      <div className="space-y-2">
        {requestRows.length === 0 && (
          <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-foreground-muted">
            No requests yet.
          </p>
        )}

        {requestRows.map((r) => {
          const StatusIcon = statusIcons[r.status] ?? Clock;

          return (
            <div
              key={r.id}
              className="rounded-md border border-border bg-surface p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {r.title}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {new Date(r.created_at).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>

                <span
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles[r.status]}`}
                >
                  <StatusIcon
                    className={`h-3 w-3 ${
                      r.status === "in_progress" ? "animate-spin" : ""
                    }`}
                  />
                  {r.status.replace("_", " ")}
                </span>
              </div>

              {r.description && (
                <p className="mt-1.5 line-clamp-2 text-xs text-foreground-muted">
                  {r.description}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        hrefForPage={(p) => (p > 1 ? `/tenant/maintenance?page=${p}` : "/tenant/maintenance")}
      />
    </div>
  );
}
