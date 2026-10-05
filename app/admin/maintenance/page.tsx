import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateMaintenanceRequestStatus } from "@/lib/actions";
import { getMaintenanceSettings } from "@/lib/maintenance-settings";

const statusStyles: Record<string, string> = {
  pending: "bg-status-partial/15 text-status-partial",
  acknowledged: "bg-accent/15 text-accent",
  in_progress: "bg-accent/15 text-accent",
  completed: "bg-status-paid/15 text-status-paid",
  rejected: "bg-status-overdue/15 text-status-overdue",
};

const nextActions: Record<string, { label: string; status: string }[]> = {
  pending: [
    { label: "Acknowledge", status: "acknowledged" },
    { label: "Reject", status: "rejected" },
  ],
  acknowledged: [
    { label: "Start work", status: "in_progress" },
    { label: "Mark done", status: "completed" },
  ],
  in_progress: [{ label: "Mark done", status: "completed" }],
  completed: [],
  rejected: [],
};

type RequestRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  room_id: string | null;
  tenants: { full_name: string } | { full_name: string }[] | null;
  rooms: { room_number: string } | { room_number: string }[] | null;
};

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role !== "owner") redirect("/tenant");

  const dormId = session.profile?.dorm_id;
  if (!dormId) redirect("/");

  const supabase = createAdminClient();
  const { requireApproval, allowRequests } = await getMaintenanceSettings(
    dormId
  );

  // With approval required, pending requests can only be acknowledged or
  // rejected. Without it, the owner can act on a pending request directly.
  const actionsFor = (status: string) =>
    status === "pending" && !requireApproval
      ? [
          { label: "Acknowledge", status: "acknowledged" },
          { label: "Start work", status: "in_progress" },
          { label: "Mark done", status: "completed" },
          { label: "Reject", status: "rejected" },
        ]
      : nextActions[status] ?? [];

  const { data: requests } = await supabase
    .from("maintenance_requests")
    .select(
      "id, title, description, status, created_at, room_id, tenants(full_name), rooms(room_number)"
    )
    .eq("dorm_id", dormId)
    .order("created_at", { ascending: false });

  const requestRows = (requests as RequestRow[] | null) ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="font-heading text-lg font-semibold text-primary">
          Maintenance requests
        </h1>
        <p className="text-xs text-foreground-muted">
          Tenant-reported issues for your dormitory.
        </p>
        {!allowRequests && (
          <p className="mt-2 text-xs text-status-partial">
            Tenant requests are turned off in Settings. Existing requests are
            still listed below.
          </p>
        )}
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

      <div className="space-y-3">
        {requestRows.length === 0 && (
          <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-foreground-muted">
            No maintenance requests yet.
          </p>
        )}

        {requestRows.map((r) => {
          const tenantName = Array.isArray(r.tenants)
            ? r.tenants[0]?.full_name
            : r.tenants?.full_name;
          const roomNumber = Array.isArray(r.rooms)
            ? r.rooms[0]?.room_number
            : r.rooms?.room_number;

          return (
            <div
              key={r.id}
              className="rounded-lg border border-border bg-surface p-5"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <p className="font-heading text-sm font-semibold">
                    {r.title}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {tenantName ?? "Unknown tenant"}
                    {roomNumber ? ` · Room ${roomNumber}` : ""} ·{" "}
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                    statusStyles[r.status]
                  }`}
                >
                  {r.status.replace("_", " ")}
                </span>
              </div>

              {r.description && (
                <p className="mb-3 text-sm text-foreground-muted">
                  {r.description}
                </p>
              )}

              {actionsFor(r.status).length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {actionsFor(r.status).map((action) => (
                    <form
                      action={updateMaintenanceRequestStatus}
                      key={action.status}
                    >
                      <input type="hidden" name="requestId" value={r.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={action.status}
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground-muted hover:text-foreground"
                      >
                        {action.label}
                      </button>
                    </form>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
