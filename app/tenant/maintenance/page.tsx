import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitMaintenanceRequest } from "@/lib/actions";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";
const labelClass = "mb-1.5 block text-xs font-medium text-foreground-muted";

const statusStyles: Record<string, string> = {
  pending: "bg-status-partial/15 text-status-partial",
  acknowledged: "bg-accent/15 text-accent",
  in_progress: "bg-accent/15 text-accent",
  completed: "bg-status-paid/15 text-status-paid",
  rejected: "bg-status-overdue/15 text-status-overdue",
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
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role !== "tenant") redirect("/admin");

  const supabase = createAdminClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("profile_id", session.user.id)
    .maybeSingle();

  const { data: requests } = tenant
    ? await supabase
        .from("maintenance_requests")
        .select("id, title, description, status, created_at")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const requestRows = (requests as RequestRow[] | null) ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-heading text-lg font-semibold text-primary">
          Maintenance requests
        </h1>
        <p className="text-xs text-foreground-muted">
          Report an issue with your room or the dorm.
        </p>
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

      <form
        action={submitMaintenanceRequest}
        className="mb-6 rounded-lg border border-border bg-surface p-6"
      >
        <p className="mb-4 font-heading text-sm font-semibold">
          Submit a request
        </p>
        <div className="mb-4">
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
        <div className="mb-4">
          <label htmlFor="description" className={labelClass}>
            Details (optional)
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            placeholder="Bathroom sink drips constantly, worse at night."
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
        >
          Submit request
        </button>
      </form>

      <div className="space-y-3">
        {requestRows.length === 0 && (
          <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-foreground-muted">
            No requests yet.
          </p>
        )}

        {requestRows.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-border bg-surface p-5"
          >
            <div className="mb-1 flex items-start justify-between gap-3">
              <p className="font-heading text-sm font-semibold">{r.title}</p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                  statusStyles[r.status]
                }`}
              >
                {r.status.replace("_", " ")}
              </span>
            </div>
            <p className="text-xs text-foreground-muted">
              {new Date(r.created_at).toLocaleDateString()}
            </p>
            {r.description && (
              <p className="mt-2 text-sm text-foreground-muted">
                {r.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
