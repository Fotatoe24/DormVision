import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { approveRegistrationRequest, rejectRegistrationRequest } from "@/lib/actions";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";

const reviewedStatusStyles: Record<string, string> = {
  approved: "bg-status-paid/15 text-status-paid",
  rejected: "bg-status-overdue/15 text-status-overdue",
  cancelled: "bg-foreground-muted/15 text-foreground-muted",
};

const reviewedStatusLabels: Record<string, string> = {
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function TenantRequestsPage({
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

  const [{ data: pending, error: pendingError }, { data: reviewed, error: reviewedError }] =
    await Promise.all([
      supabase
        .from("tenant_registration_requests")
        .select(
          "id, full_name, email, contact_number, requested_room_note, message, submitted_at"
        )
        .eq("dorm_id", dormId)
        .eq("status", "pending")
        .order("submitted_at", { ascending: true }),
      supabase
        .from("tenant_registration_requests")
        .select("id, full_name, email, status, submitted_at, reviewed_at, rejection_reason")
        .eq("dorm_id", dormId)
        .neq("status", "pending")
        .order("reviewed_at", { ascending: false })
        .limit(20),
    ]);

  const loadError = pendingError?.message || reviewedError?.message || null;

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-lg border border-status-overdue/30 bg-status-overdue/10 px-4 py-3 text-sm text-status-overdue">
          Could not load registration requests: {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs text-foreground-muted">Owner dashboard</p>
        <h1 className="font-heading text-lg font-semibold text-primary">
          Tenant Registration Requests
        </h1>
        <p className="text-xs text-foreground-muted">
          {(pending ?? []).length} pending
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

      {/* Pending requests */}
      <div className="mb-6 space-y-3">
        {(pending ?? []).length === 0 ? (
          <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-foreground-muted">
            No pending registration requests right now.
          </p>
        ) : (
          (pending ?? []).map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-border bg-surface p-5"
            >
              <div className="mb-3">
                <p className="font-heading text-sm font-semibold">
                  {r.full_name}
                </p>
                <p className="text-xs text-foreground-muted">{r.email}</p>
                {r.contact_number && (
                  <p className="text-xs text-foreground-muted">
                    {r.contact_number}
                  </p>
                )}
                <p className="mt-1 text-xs text-foreground-muted">
                  Submitted {formatDate(r.submitted_at)}
                </p>
              </div>

              {(r.requested_room_note || r.message) && (
                <div className="mb-3 space-y-1 rounded-md bg-surface-muted px-3 py-2 text-xs">
                  {r.requested_room_note && (
                    <p>
                      <span className="text-foreground-muted">
                        Preferred room:
                      </span>{" "}
                      {r.requested_room_note}
                    </p>
                  )}
                  {r.message && (
                    <p>
                      <span className="text-foreground-muted">Message:</span>{" "}
                      {r.message}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <details className="flex-1">
                  <summary className="cursor-pointer list-none rounded-md bg-primary px-3 py-1.5 text-center text-xs font-medium text-surface hover:opacity-90">
                    Approve
                  </summary>
                  <form
                    action={approveRegistrationRequest}
                    className="mt-2 rounded-md border border-border bg-background p-3"
                  >
                    <input type="hidden" name="requestId" value={r.id} />
                    <p className="mb-2 text-xs text-foreground-muted">
                      {r.full_name} will become an active tenant. No room
                      will be assigned automatically.
                    </p>
                    <button
                      type="submit"
                      className="w-full rounded-md bg-primary py-1.5 text-xs font-medium text-surface hover:opacity-90"
                    >
                      Confirm approval
                    </button>
                  </form>
                </details>

                <details className="flex-1">
                  <summary className="cursor-pointer list-none rounded-md border border-status-overdue/30 px-3 py-1.5 text-center text-xs text-status-overdue hover:bg-status-overdue/10">
                    Reject
                  </summary>
                  <form
                    action={rejectRegistrationRequest}
                    className="mt-2 rounded-md border border-border bg-background p-3"
                  >
                    <input type="hidden" name="requestId" value={r.id} />
                    <p className="mb-2 text-xs text-foreground-muted">
                      {r.full_name} will not become a tenant.
                    </p>
                    <label
                      htmlFor={`reason-${r.id}`}
                      className="mb-1 block text-[11px] font-medium text-foreground-muted"
                    >
                      Reason (optional, shown to the applicant)
                    </label>
                    <textarea
                      id={`reason-${r.id}`}
                      name="reason"
                      rows={2}
                      className={`${inputClass} mb-2`}
                    />
                    <button
                      type="submit"
                      className="w-full rounded-md border border-status-overdue/30 py-1.5 text-xs text-status-overdue hover:bg-status-overdue/10"
                    >
                      Confirm rejection
                    </button>
                  </form>
                </details>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Reviewed history */}
      <details className="rounded-lg border border-border bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-heading font-semibold">
          Reviewed requests
        </summary>
        {(reviewed ?? []).length === 0 ? (
          <p className="border-t border-border px-4 py-6 text-center text-sm text-foreground-muted">
            No reviewed requests yet.
          </p>
        ) : (
          <div className="border-t border-border">
            {(reviewed ?? []).map((r, i) => (
              <div
                key={r.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${
                  i < (reviewed ?? []).length - 1
                    ? "border-b border-border"
                    : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.full_name}</p>
                  <p className="text-xs text-foreground-muted">
                    {r.email}
                    {r.reviewed_at ? ` · ${formatDate(r.reviewed_at)}` : ""}
                  </p>
                  {r.rejection_reason && (
                    <p className="text-xs text-foreground-muted">
                      Reason: {r.rejection_reason}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    reviewedStatusStyles[r.status] ?? ""
                  }`}
                >
                  {reviewedStatusLabels[r.status] ?? r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </details>
    </div>
  );
}
