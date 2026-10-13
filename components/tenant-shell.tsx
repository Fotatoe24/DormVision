"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";
import { LogOut, User, ChevronDown } from "lucide-react";
import { ThemeMenuItem } from "@/components/theme-menu-item";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { BrandMark } from "@/components/brand-mark";
import { tenantNavigation } from "@/lib/navigation";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

// Same shape as AdminShell's AccountMenu (components/admin-shell.tsx),
// just without Profile/Admin settings rows -- the tenant nav already
// has its own Profile entry (lib/navigation.ts's tenantProfile), so
// there's nothing to duplicate here beyond theme + sign out.
function AccountMenu({
  tenantName,
  align = "left",
  direction = "down",
  open,
  onOpenChange,
}: {
  tenantName?: string;
  align?: "left" | "right";
  direction?: "down" | "up";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account"
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-muted ${focusRing}`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <User className="h-3.5 w-3.5" />
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-xs font-medium text-foreground">
            {tenantName ?? "Tenant"}
          </span>
        </span>
        <ChevronDown
          className={`hidden h-3.5 w-3.5 shrink-0 text-foreground-muted transition-transform sm:block ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-50 w-48 rounded-lg border border-border bg-surface p-1.5 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          } ${direction === "up" ? "bottom-full mb-2" : "mt-2"}`}
        >
          <ThemeMenuItem />

          <div className="my-1.5 h-px bg-border" />

          <form action={logout}>
            <button
              type="submit"
              role="menuitem"
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground ${focusRing}`}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// Tenant navigation is genuinely small (see lib/navigation.ts) — just
// Home and Profile — so there's no "More" sheet on the tenant side at
// all, unlike Admin. The bottom nav still applies the same fixed,
// safe-area-aware pattern for consistency.
export function TenantShell({
  dormName,
  tenantName,
  pendingMaintenanceCount = 0,
  children,
}: {
  dormName?: string;
  tenantName?: string;
  pendingMaintenanceCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Same render-time reset pattern as AdminShell — see its own comment
  // for why this runs here and not in an effect.
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (accountOpen) setAccountOpen(false);
  }

  const sidebarFooter = (
    <div className="border-t border-border px-3 py-3">
      <AccountMenu
        tenantName={tenantName}
        direction="up"
        open={accountOpen}
        onOpenChange={setAccountOpen}
      />
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

          <AccountMenu
            tenantName={tenantName}
            align="right"
            open={accountOpen}
            onOpenChange={setAccountOpen}
          />
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
