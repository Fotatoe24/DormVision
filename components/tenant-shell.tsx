"use client";

import { logout } from "@/lib/actions";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { tenantNavigation } from "@/lib/navigation";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function BrandMark() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-surface">
      <svg
        width="16"
        height="16"
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
  );
}

function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={logout}>
      <button
        type="submit"
        aria-label="Sign out"
        className={`flex items-center gap-2 rounded-md text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground ${focusRing} ${
          className ?? ""
        }`}
      >
        <LogOut className="h-4 w-4" />
        <span className="text-sm">Sign out</span>
      </button>
    </form>
  );
}

// Tenant navigation is genuinely small (see lib/navigation.ts) — just
// Home and Profile — so there's no "More" sheet on the tenant side at
// all, unlike Admin. The bottom nav still applies the same fixed,
// safe-area-aware pattern for consistency.
export function TenantShell({
  dormName,
  pendingMaintenanceCount = 0,
  children,
}: {
  dormName?: string;
  pendingMaintenanceCount?: number;
  children: React.ReactNode;
}) {
  const sidebarFooter = (
    <div className="border-t border-border px-3 py-3">
      <div className="mb-2 flex justify-end">
        <ThemeToggle />
      </div>
      <SignOutButton className="w-full px-3 py-2" />
    </div>
  );

  return (
    <div className="flex min-h-screen flex-1">
      <a
        href="#main-content"
        className={`sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-xs focus:font-medium focus:text-surface ${focusRing}`}
      >
        Skip to content
      </a>

      <AppSidebar
        subtitle={dormName}
        groups={tenantNavigation.desktopGroups}
        badgeCounts={{ myPendingMaintenance: pendingMaintenanceCount }}
        footer={sidebarFooter}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3 sm:hidden">
          <div className="flex items-center gap-2">
            <BrandMark />
            <p className="font-heading text-sm font-semibold text-foreground">
              DormVision
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SignOutButton className="p-2" />
          </div>
        </div>

        <main
          id="main-content"
          className="min-h-screen flex-1 bg-background px-6 py-10 text-foreground pb-[calc(56px+env(safe-area-inset-bottom)+2.5rem)] sm:pb-10"
        >
          {children}
        </main>
      </div>

      <BottomNav
        items={tenantNavigation.primary}
        hasMore={false}
        moreActive={false}
        badgeCounts={{ myPendingMaintenance: pendingMaintenanceCount }}
        onMoreClick={() => {}}
      />
    </div>
  );
}
