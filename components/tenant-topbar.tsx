import { logout } from "@/lib/actions";
import Link from "next/link";
import { Settings, User, LogOut } from "lucide-react";

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

        {/* Settings Dropdown */}
        <div className="group relative">
          <button
            type="button"
            className="flex items-center justify-center rounded-md border border-border bg-background p-2 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>

          <div className="invisible absolute right-0 top-full z-50 w-44 pt-2 opacity-0 transition-all duration-150 group-hover:visible group-hover:opacity-100">
            <div className="rounded-lg border border-border bg-surface p-1.5 shadow-lg">
              {/* Profile */}
              <Link
                href="/profile"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              >
                <User className="h-4 w-4" />
                Profile
              </Link>

              {/* Sign out */}
              <form action={logout}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
