import Link from "next/link";
import { login } from "@/lib/actions";
import { ToastListener } from "@/components/toast-listener";
import { SubmitButton } from "@/components/submit-button";
import { PasswordInput } from "@/components/password-input";
import { BrandMark } from "@/components/brand-mark";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";
const labelClass = "mb-1.5 block text-xs font-medium text-foreground-muted";

/**
 * The full sign-in card, shared by both `/` and `/login`. Both routes stay
 * live (deliberate), but the markup only lives here now — edit once, both
 * routes stay in sync.
 */
export function LoginCard() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-background px-6 py-12">
      <ToastListener />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark className="mb-4 h-128 w-128" />
          <h1 className="font-heading text-lg font-semibold text-foreground">
            DormVision
          </h1>
          <p className="mt-1 text-xs text-foreground-muted">
            Sign in to manage your dormitory
          </p>
        </div>

        <form
          action={login}
          className="rounded-lg border border-border bg-surface p-6 shadow-sm"
        >
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
              placeholder="you@dormvision.com"
              className={inputClass}
            />
          </div>

          <div className="mb-5">
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className={inputClass}
            />
          </div>

          <SubmitButton
            pendingText="Signing in…"
            className="w-full rounded-md bg-primary py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Sign in
          </SubmitButton>
        </form>

        <p className="mt-4 text-center text-xs text-foreground-muted">
          Setting up a new dormitory?{" "}
          <Link href="/signup" className="text-primary hover:underline">
            Create one
          </Link>
        </p>
        <p className="mt-1 text-center text-xs text-foreground-muted">
          Joining as a tenant?{" "}
          <Link href="/signup/tenant" className="text-primary hover:underline">
            Sign up with a Dorm ID
          </Link>
        </p>
      </div>
    </main>
  );
}
