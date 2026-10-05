"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import type { NavItem } from "@/lib/navigation";

function isItemActive(pathname: string, href: string) {
  const isRootRoute = href === "/admin" || href === "/tenant";
  return isRootRoute ? pathname === href : pathname.startsWith(href);
}

// Fixed bottom navigation, mobile-only (hidden at `sm` and up, where
// AppSidebar takes over). Deliberately capped at 4 primary items plus
// an optional "More" trigger — mobile prioritizes quick thumb access
// over showing the whole system at once, unlike the desktop sidebar.
export function BottomNav({
  items,
  hasMore,
  moreActive,
  moreBadge = false,
  badgeCounts = {},
  onMoreClick,
}: {
  items: NavItem[];
  hasMore: boolean;
  moreActive: boolean;
  moreBadge?: boolean;
  badgeCounts?: Partial<
    Record<
      "pendingRequests" | "pendingMaintenance" | "myPendingMaintenance",
      number
    >
  >;
  onMoreClick: () => void;
}) {
  const pathname = usePathname();
  const slotCount = items.length + (hasMore ? 1 : 0);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${slotCount}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const active = isItemActive(pathname, item.href);
          const Icon = item.icon;
          const badgeCount = item.badge ? badgeCounts[item.badge] ?? 0 : 0;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] transition-colors ${
                active ? "text-primary" : "text-foreground-muted"
              }`}
            >
              <span className="relative">
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                {badgeCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-status-overdue"
                  />
                )}
              </span>
              <span className={active ? "font-medium" : ""}>{item.label}</span>
            </Link>
          );
        })}
        {hasMore && (
          <button
            type="button"
            onClick={onMoreClick}
            aria-haspopup="dialog"
            aria-current={moreActive ? "page" : undefined}
            className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] transition-colors ${
              moreActive ? "text-primary" : "text-foreground-muted"
            }`}
          >
            <span className="relative">
              <MoreHorizontal
                className="h-5 w-5"
                strokeWidth={moreActive ? 2.5 : 2}
              />
              {moreBadge && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-status-overdue"
                />
              )}
            </span>
            <span className={moreActive ? "font-medium" : ""}>More</span>
          </button>
        )}
      </div>
    </nav>
  );
}
