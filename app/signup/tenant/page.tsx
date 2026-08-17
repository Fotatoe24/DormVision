import Link from "next/link";
import { signUpTenant } from "@/lib/actions";
import { ToastListener } from "@/components/toast-listener";
import { SubmitButton } from "@/components/submit-button";
import { PasswordInput } from "@/components/password-input";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";
const labelClass = "mb-1.5 block text-xs font-medium text-foreground-muted";

export default function TenantSignUpPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-background px-6 py-12">
      <ToastListener />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <h1 className="font-heading text-lg font-semibold text-foreground">
            Request to join your dormitory
          </h1>
          <p className="mt-1 text-xs text-foreground-muted">
            Ask your dorm owner for the Dorm ID. Your dorm owner reviews and
            approves every request before you become a tenant.
          </p>
        </div>

        <form
          action={signUpTenant}
          className="rounded-lg border border-border bg-surface p-6 shadow-sm"
        >
          <div className="mb-4">
            <label htmlFor="dormCode" className={labelClass}>
              Dorm ID
            </label>
            <input
              id="dormCode"
              name="dormCode"
              type="text"
              required
              placeholder="e.g. 7F3A9B2C"
              className={`${inputClass} font-mono uppercase tracking-wider`}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="fullName" className={labelClass}>
              Your name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              placeholder="Maria Santos"
              className={inputClass}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="phone" className={labelClass}>
              Phone number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              placeholder="09xx xxx xxxx"
              className={inputClass}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className={inputClass}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="••••••••"
              className={inputClass}
              ariaDescribedBy="password-hint"
            />
            <p id="password-hint" className="mt-1.5 text-[11px] text-foreground-muted">
              At least 6 characters.
            </p>
          </div>

          <div className="mb-4">
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

          <div className="mb-5">
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

          <SubmitButton
            pendingText="Submitting…"
            className="w-full rounded-md bg-primary py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Submit registration
          </SubmitButton>
        </form>

        <p className="mt-4 text-center text-xs text-foreground-muted">
          Already have an account?{" "}
          <Link href="/" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
