import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { logout } from "@/lib/actions";

export default async function TenantPage() {
  const session = await getSessionUser();

  if (!session) {
    redirect("/");
  }

  return (
    <main className="flex-1 bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-heading text-lg font-semibold text-primary">
            DormVision
          </h1>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="font-heading text-sm font-semibold mb-1">
            Welcome, {session.profile?.full_name ?? session.user.email}
          </p>
          <p className="text-sm text-foreground-muted">
            Your billing, room, and payment info will show up here once
            Phase&nbsp;2 (billing) is built.
          </p>
        </div>
      </div>
    </main>
  );
}
