import Link from "next/link";
import { signUpOwner } from "@/lib/actions";
import { ToastListener } from "@/components/toast-listener";
import { SubmitButton } from "@/components/submit-button";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";
const labelClass = "mb-1.5 block text-xs font-medium text-foreground-muted";

export default function OwnerSignUpPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-background px-6 py-12">
      <ToastListener />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <h1 className="font-heading text-lg font-semibold text-foreground">
            Set up your dormitory
          </h1>
          <p className="mt-1 text-xs text-foreground-muted">
            You&apos;ll get a Dorm ID to share with your tenants after this.
          </p>
        </div>

        <form
          action={signUpOwner}
          className="rounded-lg border border-border bg-surface p-6"
        >
          <div className="mb-4">
            <label htmlFor="fullName" className={labelClass}>
              Your name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              placeholder="Aldrin Reyes"
              className={inputClass}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="dormName" className={labelClass}>
              Dormitory name
            </label>
            <input
              id="dormName"
              name="dormName"
              type="text"
              required
              placeholder="Mariveles Student Dorm"
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
              placeholder="you@dormvision.com"
              className={inputClass}
            />
          </div>

          <div className="mb-5">
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="••••••••"
              className={inputClass}
            />
          </div>

          <SubmitButton
            pendingText="Creating dormitory…"
            className="w-full rounded-md bg-primary py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Create dormitory
          </SubmitButton>
        </form>

        <p className="mt-4 text-center text-xs text-foreground-muted">
          Already have an account?{" "}
          <Link href="/" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
        <p className="mt-1 text-center text-xs text-foreground-muted">
          Joining an existing dormitory?{" "}
          <Link href="/signup/tenant" className="text-primary hover:underline">
            Sign up with a Dorm ID
          </Link>
        </p>
      </div>
    </main>
  );
}
