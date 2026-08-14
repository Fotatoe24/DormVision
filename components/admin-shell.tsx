"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";

type NavItem = {
  label: string;
  href?: string;
};

const navItems: NavItem[] = [
  { label: "Overview", href: "/admin" },
  { label: "Rooms", href: "/admin/rooms" },
  { label: "Tenants" },
  { label: "Billing" },
  { label: "Payments" },
  { label: "Expenses" },
  { label: "Monitoring" },
  { label: "Settings" },
];

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
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3">
      {navItems.map((item) => {
        if (!item.href) {
          return (
            <span
              key={item.label}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-foreground-muted/50"
            >
              {item.label}
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                Soon
              </span>
            </span>
          );
        }

        const isActive =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary/10 text-primary"
                : "text-foreground-muted hover:bg-surface-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
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

  const sidebarFooter = (
    <div className="border-t border-border px-3 py-3">
      <p className="truncate px-3 text-xs font-medium text-foreground">
        {ownerName ?? "Owner"}
      </p>
      <form action={logout}>
        <button
          type="submit"
          className="mt-1 w-full rounded-md px-3 py-1.5 text-left text-xs text-foreground-muted hover:bg-surface-muted hover:text-foreground"
        >
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-full flex-1">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface sm:flex">
        <div className="flex items-center gap-2 px-4 py-4">
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
        <NavList pathname={pathname} />
        {sidebarFooter}
      </aside>

      {/* Mobile topbar */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 sm:hidden">
          <div className="flex items-center gap-2">
            <BrandMark />
            <p className="font-heading text-sm font-semibold text-foreground">
              DormVision
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="rounded-md border border-border p-1.5 text-foreground-muted hover:text-foreground"
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

        {/* Mobile drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 sm:hidden">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 bg-foreground/30"
            />
            <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface shadow-lg">
              <div className="flex items-center justify-between px-4 py-4">
                <div className="flex items-center gap-2">
                  <BrandMark />
                  <p className="font-heading text-sm font-semibold text-foreground">
                    DormVision
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setDrawerOpen(false)}
                  className="text-foreground-muted hover:text-foreground"
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
              <NavList
                pathname={pathname}
                onNavigate={() => setDrawerOpen(false)}
              />
              {sidebarFooter}
            </div>
          </div>
        )}

        <main className="flex-1 bg-background px-6 py-10 text-foreground">
          {children}
        </main>
      </div>
    </div>
  );
}
