import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { login } from "@/lib/actions";
import { ToastListener } from "@/components/toast-listener";
import { SubmitButton } from "@/components/submit-button";

export default async function Home() {
  const session = await getSessionUser();

  // Already signed in — skip straight to the right dashboard.
  if (session) {
    redirect(session.profile?.role === "owner" ? "/admin" : "/tenant");
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-background px-6 py-12">
      <ToastListener />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-primary text-surface">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 21h18" />
              <path d="M5 21V7l8-4 8 4v14" />
              <path d="M9 21v-6h6v6" />
            </svg>
          </div>
          <h1 className="font-heading text-lg font-semibold text-foreground">
            DormVision
          </h1>
          <p className="mt-1 text-xs text-foreground-muted">
            Sign in to manage your dormitory
          </p>
        </div>

        <form
          action={login}
          className="rounded-lg border border-border bg-surface p-6"
        >
          <div className="mb-4">
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs font-medium text-foreground-muted"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@dormvision.com"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="mb-5">
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-medium text-foreground-muted"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
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
