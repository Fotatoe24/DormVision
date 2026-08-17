import {
  cancelRegistrationRequest,
  submitRegistrationRequest,
  logout,
} from "@/lib/actions";

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
      <button
        type="submit"
        className="w-full rounded-md bg-primary py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
      >
        Submit registration
      </button>
    </form>
  );
}

export function RegistrationStatus({
  state,
  error,
  saved,
}: {
  state:
    | { status: "pending"; requestId: string }
    | { status: "rejected"; requestId: string; reason: string | null }
    | { status: "none" };
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
            <button
              type="submit"
              className="text-xs text-foreground-muted underline hover:text-status-overdue"
            >
              Cancel this request
            </button>
          </form>
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
        <button
          type="submit"
          className="w-full rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
