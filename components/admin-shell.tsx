"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";
import { Settings, User, LogOut, ChevronDown } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandMark } from "@/components/nav/brand-mark";
import { SidebarNav } from "@/components/nav/sidebar-nav";
import { MobileBottomNav } from "@/components/nav/mobile-bottom-nav";
import { MoreSheet } from "@/components/nav/more-sheet";
import { adminNavigation } from "@/lib/navigation";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function AdminShell({
  dormName,
  ownerName,
  pendingRequestsCount = 0,
  children,
}: {
  dormName?: string;
  ownerName?: string;
  pendingRequestsCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const badges = { pendingRequests: pendingRequestsCount || undefined };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Close menus when the route changes. Adjusted during render (React's
  // recommended pattern for resetting state on a prop change) rather than
  // in an effect — setState synchronously inside an effect body triggers
  // an extra cascading render on every route change.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setSettingsOpen(false);
    setMoreOpen(false);
  }

  return (
    <div className="flex min-h-screen flex-1">
      {/* Skip link */}
      <a
        href="#main-content"
        className={`sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-xs focus:font-medium focus:text-surface ${focusRing}`}
      >
        Skip to content
      </a>

      {/* =========================================================
          DESKTOP SIDEBAR
          Shows every real admin module directly — no "More" here.
         ========================================================= */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-surface sm:flex">
        {/* Brand */}
        <div className="flex shrink-0 items-center gap-2 px-4 py-4">
          <BrandMark />

          <div className="min-w-0">
            <p className="font-heading text-sm font-semibold text-foreground">
              DormVision
            </p>

            <p className="truncate text-xs text-foreground-muted">
              {dormName ?? "Your dormitory"}
            </p>
          </div>
        </div>

        {/* Navigation */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav
            pathname={pathname}
            label="Admin"
            groups={adminNavigation.sidebar}
            badges={badges}
          />
        </div>

        {/* Account / Settings */}
        <div className="shrink-0 border-t border-border px-3 py-3">
          <div className="mb-2 flex justify-end">
            <ThemeToggle />
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-expanded={settingsOpen}
              aria-haspopup="menu"
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-surface-muted ${focusRing}`}
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">
                  {ownerName ?? "Owner"}
                </p>

                <p className="text-[10px] text-foreground-muted">
                  Account settings
                </p>
              </div>

              <ChevronDown
                className={`h-4 w-4 shrink-0 text-foreground-muted transition-transform ${
                  settingsOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {settingsOpen && (
              <div
                role="menu"
                className="absolute bottom-full left-0 right-0 z-50 mb-2 rounded-lg border border-border bg-surface p-1.5 shadow-lg"
              >
                <Link
                  href="/profile"
                  role="menuitem"
                  onClick={() => setSettingsOpen(false)}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground ${focusRing}`}
                >
                  <User className="h-4 w-4" />
                  Profile
                </Link>

                <Link
                  href="/admin/settings"
                  role="menuitem"
                  onClick={() => setSettingsOpen(false)}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground ${focusRing}`}
                >
                  <Settings className="h-4 w-4" />
                  Admin settings
                </Link>

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
        </div>
      </aside>

      {/* =========================================================
          MAIN AREA
         ========================================================= */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3 sm:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <BrandMark />

            <div className="min-w-0">
              <p className="font-heading text-sm font-semibold leading-tight text-foreground">
                DormVision
              </p>
              <p className="truncate text-[11px] leading-tight text-foreground-muted">
                {dormName ?? "Your dormitory"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />

            <div className="relative">
              <button
                type="button"
                onClick={() => setSettingsOpen((open) => !open)}
                aria-label="Account"
                aria-expanded={settingsOpen}
                aria-haspopup="menu"
                className={`flex items-center justify-center rounded-md border border-border bg-background p-2 text-foreground-muted hover:text-foreground ${focusRing}`}
              >
                <User className="h-4 w-4" aria-hidden="true" />
              </button>

              {settingsOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-border bg-surface p-1.5 shadow-lg"
                >
                  <p className="truncate px-3 py-1.5 text-xs font-medium text-foreground-muted">
                    {ownerName ?? "Owner"}
                  </p>
                  <Link
                    href="/profile"
                    role="menuitem"
                    onClick={() => setSettingsOpen(false)}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground ${focusRing}`}
                  >
                    <User className="h-4 w-4" />
                    Profile
                  </Link>
                  <Link
                    href="/admin/settings"
                    role="menuitem"
                    onClick={() => setSettingsOpen(false)}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground ${focusRing}`}
                  >
                    <Settings className="h-4 w-4" />
                    Admin settings
                  </Link>
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
          </div>
        </div>

        {/* Main content — extra bottom padding on mobile clears the fixed
            bottom nav; sm+ drops it since the bottom nav is hidden there. */}
        <main
          id="main-content"
          className="min-h-screen flex-1 bg-background px-6 py-10 pb-24 text-foreground sm:pb-10"
        >
          {children}
        </main>

        {/* =========================================================
            MOBILE BOTTOM NAVIGATION + MORE SHEET
           ========================================================= */}
        <MobileBottomNav
          pathname={pathname}
          primary={adminNavigation.primary}
          more={adminNavigation.more}
          badges={badges}
          moreOpen={moreOpen}
          onToggleMore={() => setMoreOpen((open) => !open)}
        />

        <MoreSheet
          pathname={pathname}
          groups={adminNavigation.more}
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          badges={badges}
        />
      </div>
    </div>
  );
}
