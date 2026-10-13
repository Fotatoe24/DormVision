import Link from "next/link";
import { Building2, UserPlus } from "lucide-react";
import { login } from "@/lib/actions";
import { ToastListener } from "@/components/toast-listener";
import { SubmitButton } from "@/components/submit-button";
import { PasswordInput } from "@/components/password-input";
import { BrandMark } from "@/components/brand-mark";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";
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
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark className="h-32 w-32" />
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            DormVision
          </h1>
          <p className="mt-1.5 text-sm text-foreground-muted">
            Sign in to manage your dormitory
          </p>
        </div>

        <form
          action={login}
          className="rounded-xl border border-border bg-surface p-8 shadow-lg"
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

          <div className="mb-6">
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-primary hover:underline"
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
            className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Sign in
          </SubmitButton>
        </form>

        <div className="mt-7">
          <div className="mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-foreground-muted">
              New here?
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/signup"
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary hover:bg-primary/5"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Create a dormitory
                </p>
                <p className="text-xs text-foreground-muted">
                  Set up as an owner
                </p>
              </div>
            </Link>

            <Link
              href="/signup/tenant"
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary hover:bg-primary/5"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <UserPlus className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Join as a tenant
                </p>
                <p className="text-xs text-foreground-muted">
                  Sign up with a Dorm ID
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
