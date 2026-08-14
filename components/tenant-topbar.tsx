import { logout } from "@/lib/actions";

export function TenantTopbar({ dormName }: { dormName?: string }) {
  return (
    <header className="border-b border-border bg-surface px-6 py-4">
      <div className="mx-auto flex max-w-2xl items-center justify-between">
        <div>
          <p className="text-xs text-foreground-muted">
            {dormName ?? "Your dormitory"}
          </p>
          <p className="font-heading text-sm font-semibold text-primary">
            My DormVision
          </p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
