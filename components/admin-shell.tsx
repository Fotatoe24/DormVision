"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";
import { Settings, User, LogOut, ChevronDown } from "lucide-react";

type NavItem = {
  label: string;
  href?: string;
};

const navItems: NavItem[] = [
  { label: "Overview", href: "/admin" },
  { label: "Rooms", href: "/admin/rooms" },
  { label: "Tenants", href: "/admin/tenants" },
  { label: "Billing", href: "/admin/billing" },
  { label: "Payments" },
  { label: "Expenses" },
  { label: "Monitoring" },
];

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

function NavList({
  pathname,
  label,
  onNavigate,
}: {
  pathname: string;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label={label} className="px-3">
      <ul className="flex flex-col gap-0.5">
        {navItems.map((item) => {
          if (!item.href) {
            return (
              <li key={item.label}>
                <span
                  aria-disabled="true"
                  title="Coming soon"
                  className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-foreground-muted/70"
                >
                  {item.label}

                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground-muted">
                    Soon
                  </span>
                </span>
              </li>
            );
          }

          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${focusRing} ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-foreground-muted hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AdminShell({
  dormName,
  ownerName,
  children,
}: {
  dormName?: string;
  ownerName?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close menus when the route changes. Adjusted during render (React's
  // recommended pattern for resetting state on a prop change) rather than
  // in an effect — setState synchronously inside an effect body triggers
  // an extra cascading render on every route change.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setDrawerOpen(false);
    setSettingsOpen(false);
  }

  // Handle mobile drawer keyboard behavior
  useEffect(() => {
    if (!drawerOpen) return;

    closeButtonRef.current?.focus();
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDrawerOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [drawerOpen]);

  const sidebarFooter = (
    <div className="border-t border-border px-3 py-3">
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
  );

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
          - Always follows the viewport height
          - Does not grow with page content
          - Navigation can scroll independently
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
          <NavList pathname={pathname} label="Admin" />
        </div>

        {/* Account / Settings */}
        <div className="shrink-0">{sidebarFooter}</div>
      </aside>

      {/* =========================================================
          MAIN AREA
         ========================================================= */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div inert={drawerOpen ? true : undefined} className="contents">
          {/* Mobile topbar */}
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3 sm:hidden">
            <div className="flex items-center gap-2">
              <BrandMark />

              <p className="font-heading text-sm font-semibold text-foreground">
                DormVision
              </p>
            </div>

            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              className={`rounded-md border border-border p-1.5 text-foreground-muted hover:text-foreground ${focusRing}`}
            >
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
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
          </div>

          {/* Main content */}
          <main
            id="main-content"
            className="min-h-screen flex-1 bg-background px-6 py-10 text-foreground"
          >
            {children}
          </main>
        </div>

        {/* =========================================================
            MOBILE DRAWER
           ========================================================= */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 sm:hidden">
            {/* Overlay */}
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 bg-foreground/30"
            />

            {/* Drawer */}
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface shadow-lg"
            >
              {/* Drawer header */}
              <div className="flex shrink-0 items-center justify-between px-4 py-4">
                <div className="flex items-center gap-2">
                  <BrandMark />

                  <p className="font-heading text-sm font-semibold text-foreground">
                    DormVision
                  </p>
                </div>

                <button
                  ref={closeButtonRef}
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setDrawerOpen(false)}
                  className={`text-foreground-muted hover:text-foreground ${focusRing}`}
                >
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
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Mobile navigation */}
              <div className="min-h-0 flex-1 overflow-y-auto">
                <NavList
                  pathname={pathname}
                  label="Menu"
                  onNavigate={() => setDrawerOpen(false)}
                />
              </div>

              {/* Mobile account */}
              <div className="shrink-0">{sidebarFooter}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
