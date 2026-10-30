import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/confirm-dialog";
import { SubmitButton } from "@/components/submit-button";
import {
  cancelRegistrationRequest,
  submitRegistrationRequest,
  logout,
} from "@/lib/actions";
import { formatBillDate } from "@/lib/billing";
import type { TenantAccessState } from "@/lib/tenant-status";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";
const labelClass = "mb-1.5 block text-xs font-medium text-foreground-muted";

function ResubmitForm() {
  return (
    <form action={submitRegistrationRequest} className="space-y-4">
      <div>
        <label htmlFor="dormCode" className={labelClass}>
          Dorm ID
        </label>
        <input
          id="dormCode"
          name="dormCode"
          type="text"
          required
          placeholder="e.g. 4F9A2C1D"
          className={`${inputClass} font-mono uppercase`}
        />
      </div>
      <div>
        <label htmlFor="phone" className={labelClass}>
          Phone number (optional)
        </label>
        <input id="phone" name="phone" type="text" className={inputClass} />
      </div>
      <div>
        <label htmlFor="requestedRoomNote" className={labelClass}>
          Preferred room (optional)
        </label>
        <input
          id="requestedRoomNote"
          name="requestedRoomNote"
          type="text"
          placeholder="e.g. Room 203, or no preference"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="message" className={labelClass}>
          Message to the dorm owner (optional)
        </label>
        <textarea
          id="message"
          name="message"
          rows={3}
          className={inputClass}
        />
      </div>
      <SubmitButton className="w-full rounded-md bg-primary py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90">
        Submit registration
      </SubmitButton>
    </form>
  );
}

// A moved-out tenant keeps access to the billing, invoices and receipts of
// the dorms they've lived in -- read-only, on its own page.
function PastStaysLink() {
  return (
    <Link
      href="/tenant/history"
      className="mt-4 inline-block text-xs font-medium text-primary hover:underline"
    >
      View my past billing, invoices and receipts
    </Link>
  );
}

export function RegistrationStatus({
  state,
  error,
  saved,
}: {
  state: Exclude<TenantAccessState, { status: "approved" }>;
  error?: string;
  saved?: string;
}) {
  return (
    <div className="mx-auto max-w-md">
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

      {state.status === "moved_out" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-surface p-6 text-center">
            <p className="font-heading text-sm font-semibold text-foreground">
              You&apos;ve moved out of this dormitory
            </p>
            <p className="mt-2 text-sm text-foreground-muted">
              Your tenant account here is no longer active, so the dashboard,
              billing, and maintenance pages are closed. Your billing and
              payment history is kept, and you can still view it.
            </p>
            {state.moveOutDate && (
              <span className="mt-4 inline-block rounded-full bg-status-unpaid/15 px-3 py-1 text-xs font-medium text-status-unpaid">
                Moved out {formatBillDate(state.moveOutDate)}
              </span>
            )}
            <div>
              <PastStaysLink />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-6">
            <p className="mb-1 font-heading text-sm font-semibold">
              Joining a dormitory?
            </p>
            <p className="mb-4 text-xs text-foreground-muted">
              Moving to a new dorm that uses DormVision, or back to this one?
              Enter its Dorm ID and the owner will review your request. Your
              account and history carry over.
            </p>
            <ResubmitForm />
          </div>
        </div>
      )}

      {state.status === "pending" && (
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <p className="font-heading text-sm font-semibold text-foreground">
            Your registration is pending approval
          </p>
          <p className="mt-2 text-sm text-foreground-muted">
            The dorm owner needs to approve your request before you can
            access tenant features.
          </p>
          <span className="mt-4 inline-block rounded-full bg-status-partial/15 px-3 py-1 text-xs font-medium text-status-partial">
            Status: Pending
          </span>
          <form action={cancelRegistrationRequest} className="mt-5">
            <input type="hidden" name="requestId" value={state.requestId} />
            <ConfirmSubmitButton
              className="text-xs text-foreground-muted underline hover:text-status-overdue"
              title="Cancel your request?"
              description="Your pending registration request will be withdrawn. You can apply again later."
              confirmLabel="Cancel request"
            >
              Cancel this request
            </ConfirmSubmitButton>
          </form>
          {state.hasPastStays && (
            <div>
              <PastStaysLink />
            </div>
          )}
        </div>
      )}

      {state.status === "rejected" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-status-overdue/30 bg-status-overdue/10 p-6 text-center">
            <p className="font-heading text-sm font-semibold text-status-overdue">
              Your registration request was not approved
            </p>
            {state.reason && (
              <p className="mt-2 text-sm text-foreground-muted">
                Reason: {state.reason}
              </p>
            )}
            <p className="mt-2 text-xs text-foreground-muted">
              You may contact the dorm owner for more information, or submit
              a new request below.
            </p>
            {state.hasPastStays && <PastStaysLink />}
          </div>
          <div className="rounded-lg border border-border bg-surface p-6">
            <p className="mb-4 font-heading text-sm font-semibold">
              Submit a new registration
            </p>
            <ResubmitForm />
          </div>
        </div>
      )}

      {state.status === "none" && (
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-1 font-heading text-sm font-semibold">
            Join a dormitory
          </p>
          <p className="mb-4 text-xs text-foreground-muted">
            Enter the Dorm ID your dorm owner gave you to request to join.
          </p>
          <ResubmitForm />
        </div>
      )}

      <form action={logout} className="mt-5">
        <SubmitButton className="w-full rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground">
          Sign out
        </SubmitButton>
      </form>
    </div>
  );
}
