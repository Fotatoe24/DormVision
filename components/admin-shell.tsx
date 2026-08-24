"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";
import { Settings, User, LogOut, ChevronDown } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { MoreSheet } from "@/components/more-sheet";
import { adminNavigation, allSecondaryItems } from "@/lib/navigation";

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

function AccountMenu({
  ownerName,
  align = "left",
  direction = "down",
  open,
  onOpenChange,
}: {
  ownerName?: string;
  align?: "left" | "right";
  // "down" (opens below the trigger) suits the mobile header, which
  // sits at the top of the screen. The desktop sidebar footer sits at
  // the *bottom* of a full-height sidebar, so its trigger needs "up" --
  // opening downward there pushed the menu (Sign out included) below
  // the viewport entirely, invisible and unreachable.
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
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-muted ${focusRing}`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <User className="h-3.5 w-3.5" />
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-xs font-medium text-foreground">
            {ownerName ?? "Owner"}
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
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => onOpenChange(false)}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground ${focusRing}`}
          >
            <User className="h-4 w-4" />
            Profile
          </Link>

          <Link
            href="/admin/settings"
            role="menuitem"
            onClick={() => onOpenChange(false)}
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
  );
}

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
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Close open overlays when the route changes — adjusted during render
  // (React's blessed pattern for resetting state on a prop change: state,
  // never a ref, may be read/written here) rather than in an effect, to
  // avoid an extra cascading render.
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (moreOpen) setMoreOpen(false);
    if (accountOpen) setAccountOpen(false);
  }

  const secondaryItems = allSecondaryItems(adminNavigation);
  const moreActive = secondaryItems.some((item) =>
    pathname.startsWith(item.href)
  );

  const sidebarFooter = (
    <div className="border-t border-border px-3 py-3">
      <div className="mb-2 flex justify-end">
        <ThemeToggle />
      </div>
      <AccountMenu
        ownerName={ownerName}
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
        groups={adminNavigation.desktopGroups}
        pendingBadgeCount={pendingRequestsCount}
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
            <AccountMenu
              ownerName={ownerName}
              align="right"
              open={accountOpen}
              onOpenChange={setAccountOpen}
            />
          </div>
        </div>

        {/* Main content — bottom padding on mobile clears the fixed
            bottom nav (56px) plus the device safe area. */}
        <main
          id="main-content"
          className="min-h-screen flex-1 bg-background px-6 py-10 text-foreground pb-[calc(56px+env(safe-area-inset-bottom)+2.5rem)] sm:pb-10"
        >
          {children}
        </main>
      </div>

      <BottomNav
        items={adminNavigation.primary}
        hasMore={secondaryItems.length > 0}
        moreActive={moreActive}
        moreBadge={pendingRequestsCount > 0}
        onMoreClick={() => setMoreOpen(true)}
      />

      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        groups={adminNavigation.secondaryGroups}
        pendingBadgeCount={pendingRequestsCount}
      />
    </div>
  );
}
