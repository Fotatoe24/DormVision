"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";
import { User, LogOut, ChevronDown } from "lucide-react";
import { ThemeMenuItem } from "@/components/theme-menu-item";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { MoreSheet } from "@/components/more-sheet";
import { BrandMark } from "@/components/brand-mark";
import { UserAvatar } from "@/components/user-avatar";
import { platformNavigation, allSecondaryItems } from "@/lib/navigation";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

// Same shape as AdminShell's AccountMenu: Profile (password, photo, appearance),
// theme, sign out.
function AccountMenu({
  adminName,
  avatarUrl,
  avatarColor,
  align = "left",
  direction = "down",
  open,
  onOpenChange,
  sidebar = false,
}: {
  adminName?: string;
  avatarUrl?: string | null;
  avatarColor?: string | null;
  align?: "left" | "right";
  direction?: "down" | "up";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sidebar?: boolean;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account"
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left ${
          sidebar
            ? "text-sidebar-foreground hover:bg-sidebar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-foreground"
            : `hover:bg-surface-muted ${focusRing}`
        }`}
      >
        <UserAvatar
          name={adminName ?? "Admin"}
          url={avatarUrl}
          color={avatarColor}
          size={28}
          className={sidebar ? "ring-1 ring-sidebar-border" : "ring-1 ring-border"}
        />
        <span className="hidden min-w-0 sm:block">
          <span
            className={`block truncate text-xs font-medium ${
              sidebar ? "text-sidebar-foreground" : "text-foreground"
            }`}
          >
            {adminName ?? "Admin"}
          </span>
        </span>
        <ChevronDown
          className={`hidden h-3.5 w-3.5 shrink-0 transition-transform sm:block ${
            sidebar ? "text-sidebar-muted" : "text-foreground-muted"
          } ${open ? "rotate-180" : ""}`}
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

export function PlatformShell({
  adminName,
  avatarUrl,
  avatarColor,
  pendingDormCount = 0,
  children,
}: {
  adminName?: string;
  avatarUrl?: string | null;
  avatarColor?: string | null;
  pendingDormCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Close overlays on navigation (render-time reset, as in AdminShell).
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (moreOpen) setMoreOpen(false);
    if (accountOpen) setAccountOpen(false);
  }

  const secondaryItems = allSecondaryItems(platformNavigation);
  const moreActive = secondaryItems.some((item) => pathname.startsWith(item.href));

  const sidebarFooter = (
    <div className="border-t border-sidebar-border px-3 py-3">
      <AccountMenu
        adminName={adminName}
        avatarUrl={avatarUrl}
        avatarColor={avatarColor}
        direction="up"
        open={accountOpen}
        onOpenChange={setAccountOpen}
        sidebar
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
        subtitle="Platform admin"
        groups={platformNavigation.desktopGroups}
        footer={sidebarFooter}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3 sm:hidden">
          <div className="flex items-center gap-2">
            <BrandMark />
            <p className="font-heading text-sm font-semibold text-foreground">
              DormVision
            </p>
          </div>

          <AccountMenu
            adminName={adminName}
            avatarUrl={avatarUrl}
            avatarColor={avatarColor}
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
        items={platformNavigation.primary}
        hasMore={secondaryItems.length > 0}
        moreActive={moreActive}
        onMoreClick={() => setMoreOpen(true)}
      />

      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        groups={platformNavigation.secondaryGroups}
        pendingBadgeCount={pendingDormCount}
      />
    </div>
  );
}
