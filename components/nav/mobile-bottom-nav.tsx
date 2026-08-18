"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import type { NavItem, NavGroup } from "@/lib/navigation";
import { isItemActive, isGroupActive } from "@/lib/navigation";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

type Badges = Partial<Record<NonNullable<NavItem["badgeKey"]>, number>>;

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center justify-center gap-1 py-1.5 text-[11px] font-medium ${focusRing} ${
        active ? "text-primary" : "text-foreground-muted"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Fixed bottom navigation for small screens: max 4 primary destinations
 * plus a "More" tab that opens a bottom sheet for everything else. Hidden
 * on sm+ where the desktop sidebar takes over.
 */
export function MobileBottomNav({
  pathname,
  primary,
  more,
  badges = {},
  moreOpen,
  onToggleMore,
}: {
  pathname: string;
  primary: NavItem[];
  more: NavGroup[];
  badges?: Badges;
  moreOpen: boolean;
  onToggleMore: () => void;
}) {
  const hasMore = more.some((g) => g.items.length > 0);
  const moreActive = hasMore && isGroupActive(pathname, more) && !moreOpen;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface sm:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="mx-auto flex max-w-md items-stretch px-1">
        {primary.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(pathname, item);
          const badge = item.badgeKey ? badges[item.badgeKey] : undefined;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors ${focusRing} ${
                active ? "text-primary" : "text-foreground-muted"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {item.label}
              {badge ? (
                <span className="absolute right-1/2 top-1 translate-x-3 rounded-full bg-status-overdue px-1 text-[9px] font-semibold leading-tight text-surface">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}

        {hasMore && (
          <TabButton active={moreActive || moreOpen} onClick={onToggleMore}>
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            More
            {moreActive && (
              <span
                aria-hidden="true"
                className="absolute right-1/2 top-1 h-1.5 w-1.5 translate-x-3 rounded-full bg-primary"
              />
            )}
          </TabButton>
        )}
      </div>
    </nav>
  );
}
