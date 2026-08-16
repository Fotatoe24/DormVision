import Link from "next/link";
import { requestPasswordReset } from "@/lib/actions";
import { ToastListener } from "@/components/toast-listener";
import { SubmitButton } from "@/components/submit-button";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";
const labelClass = "mb-1.5 block text-xs font-medium text-foreground-muted";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-background px-6 py-12">
      <ToastListener />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <h1 className="font-heading text-lg font-semibold text-foreground">
            Reset your password
          </h1>
          <p className="mt-1 text-xs text-foreground-muted">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        <form
          action={requestPasswordReset}
          className="rounded-lg border border-border bg-surface p-6 shadow-sm"
        >
          <div className="mb-5">
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@dormvision.com"
              className={inputClass}
            />
          </div>

          <SubmitButton
            pendingText="Sending…"
            className="w-full rounded-md bg-primary py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Send reset link
          </SubmitButton>
        </form>

        <p className="mt-4 text-center text-xs text-foreground-muted">
          Remembered your password?{" "}
          <Link href="/" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
