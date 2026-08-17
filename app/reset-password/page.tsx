import Link from "next/link";
import { resetPassword } from "@/lib/actions";
import { ToastListener } from "@/components/toast-listener";
import { SubmitButton } from "@/components/submit-button";
import { PasswordInput } from "@/components/password-input";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";
const labelClass = "mb-1.5 block text-xs font-medium text-foreground-muted";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  // The token comes straight from the emailed link (lib/actions.ts ->
  // requestPasswordReset) — no Supabase session is involved. resetPassword
  // validates it (and its expiry) server-side before touching anything.
  const { token } = await searchParams;

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-background px-6 py-12">
      <ToastListener />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <h1 className="font-heading text-lg font-semibold text-foreground">
            Set a new password
          </h1>
          <p className="mt-1 text-xs text-foreground-muted">
            Choose a new password for your account.
          </p>
        </div>

        {!token ? (
          <div className="rounded-lg border border-status-overdue/30 bg-status-overdue/10 p-6 text-center text-sm text-status-overdue">
            This link is invalid or has expired.
            <div className="mt-3">
              <Link
                href="/forgot-password"
                className="font-medium text-primary hover:underline"
              >
                Request a new link
              </Link>
            </div>
          </div>
        ) : (
          <form
            action={resetPassword}
            className="rounded-lg border border-border bg-surface p-6 shadow-sm"
          >
            <input type="hidden" name="token" value={token} />

            <div className="mb-4">
              <label htmlFor="password" className={labelClass}>
                New password
              </label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="new-password"
                required
                minLength={6}
                placeholder="min. 6 characters"
                className={inputClass}
              />
            </div>

            <div className="mb-5">
              <label htmlFor="confirmPassword" className={labelClass}>
                Confirm new password
              </label>
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                autoComplete="new-password"
                required
                minLength={6}
                placeholder="min. 6 characters"
                className={inputClass}
              />
            </div>

            <SubmitButton
              pendingText="Saving…"
              className="w-full rounded-md bg-primary py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              Update password
            </SubmitButton>
          </form>
        )}
      </div>
    </main>
  );
}
