import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LoadError } from "@/components/load-error";
import { SubmitButton } from "@/components/submit-button";
import { ReasonActionButton } from "@/components/reason-action-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-guard";
import { dormStatus, dormStatusLabels, dormStatusStyles } from "@/lib/dorm-status";
import { approveDorm, reactivateDorm, rejectDorm, suspendDorm } from "@/lib/platform-actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const buttonBase = "rounded-md px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90";
const primaryButton = `${buttonBase} bg-primary text-surface`;
const dangerButton = `${buttonBase} bg-status-overdue text-white`;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

export default async function PlatformDormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;
  const { error, saved } = await searchParams;

  if (!UUID.test(id)) notFound();

  const admin = createAdminClient();

  // Counts only: nothing about the dorm's money, bills, payments or tenants'
  // personal details is read here.
  const [dormResult, owners, tenants, rooms] = await Promise.all([
    admin
      .from("dormitories")
      .select("id, name, join_code, created_at, approved_at, suspended_at, suspended_reason")
      .eq("id", id)
      .maybeSingle(),
    admin.from("users").select("id, full_name, email, disabled_at").eq("dorm_id", id).eq("role", "owner"),
    admin.from("tenants").select("id", { count: "exact", head: true }).eq("dorm_id", id).eq("status", "active"),
    admin.from("rooms").select("id", { count: "exact", head: true }).eq("dorm_id", id),
  ]);

  if (dormResult.error) {
    console.error("Could not load the dormitory:", dormResult.error);
    return (
      <div className="mx-auto max-w-3xl">
        <LoadError what="this dormitory" />
      </div>
    );
  }

  const dorm = dormResult.data;
  if (!dorm) notFound();

  const state = dormStatus(dorm);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/platform/dorms"
        className="mb-4 inline-flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All dormitories
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-lg font-semibold text-primary">{dorm.name}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${dormStatusStyles[state]}`}>
          {dormStatusLabels[state]}
        </span>
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

      <dl className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-foreground-muted">Dorm ID</dt>
          <dd className="font-mono">{dorm.join_code ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-foreground-muted">Created</dt>
          <dd>{when(dorm.created_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-foreground-muted">Rooms</dt>
          <dd className="font-mono">{rooms.count ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-foreground-muted">Active tenants</dt>
          <dd className="font-mono">{tenants.count ?? "—"}</dd>
        </div>
        {dorm.approved_at && (
          <div>
            <dt className="text-xs text-foreground-muted">Approved</dt>
            <dd>{when(dorm.approved_at)}</dd>
          </div>
        )}
        {dorm.suspended_at && (
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-xs text-foreground-muted">Suspended {when(dorm.suspended_at)}</dt>
            <dd>{dorm.suspended_reason ?? "No reason recorded."}</dd>
          </div>
        )}
      </dl>

      <h2 className="mb-2 text-sm font-semibold text-foreground">Owner</h2>
      <div className="mb-6 overflow-hidden rounded-lg border border-border bg-surface">
        {(owners.data ?? []).length === 0 ? (
          <p className="px-4 py-4 text-sm text-foreground-muted">No owner account.</p>
        ) : (
          (owners.data ?? []).map((owner, i, all) => (
            <div
              key={owner.id}
              className={`flex items-center justify-between gap-2 px-4 py-3 ${
                i < all.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{owner.full_name}</p>
                <p className="truncate text-xs text-foreground-muted">{owner.email}</p>
              </div>
              {owner.disabled_at && (
                <span className="rounded-full bg-status-overdue/15 px-2.5 py-0.5 text-xs font-medium text-status-overdue">
                  Disabled
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-foreground">Actions</h2>
      <div className="flex flex-wrap gap-2">
        {state === "pending" && (
          <>
            <form action={approveDorm}>
              <input type="hidden" name="dormId" value={dorm.id} />
              <SubmitButton className={primaryButton}>Approve dormitory</SubmitButton>
            </form>
            <form action={rejectDorm}>
              <input type="hidden" name="dormId" value={dorm.id} />
              <ReasonActionButton
                className={dangerButton}
                title="Reject this dormitory?"
                description="The owner is emailed your reason and can't sign in."
                confirmLabel="Reject"
              >
                Reject…
              </ReasonActionButton>
            </form>
          </>
        )}

        {state === "suspended" && (
          <form action={reactivateDorm}>
            <input type="hidden" name="dormId" value={dorm.id} />
            <SubmitButton className={primaryButton}>Reactivate</SubmitButton>
          </form>
        )}

        {state === "active" && (
          <form action={suspendDorm}>
            <input type="hidden" name="dormId" value={dorm.id} />
            <ReasonActionButton
              className={dangerButton}
              title="Suspend this dormitory?"
              description="The owner and every tenant are signed out and can't sign in until you reactivate it. Nothing is deleted."
              confirmLabel="Suspend"
            >
              Suspend…
            </ReasonActionButton>
          </form>
        )}
      </div>
    </div>
  );
}
