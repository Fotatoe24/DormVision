"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "@/lib/navigation";
import { BrandMark } from "@/components/brand-mark";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-foreground";

function isItemActive(pathname: string, href: string) {
  const isRootRoute = href === "/admin" || href === "/tenant";
  return isRootRoute ? pathname === href : pathname.startsWith(href);
}

// Desktop-only sidebar (hidden below `sm`, where the bottom nav takes
// over) — shared between AdminShell and TenantShell so both roles get
// the same visual language. Shows the full navigation directly, grouped
// for scanability; nothing is tucked into a "More" menu here, unlike
// the mobile bottom nav.
export function AppSidebar({
  subtitle,
  groups,
  badgeCounts = {},
  footer,
}: {
  subtitle?: string;
  groups: NavGroup[];
  badgeCounts?: Partial<
    Record<
      "pendingRequests" | "pendingMaintenance" | "myPendingMaintenance",
      number
    >
  >;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar sm:flex">
      <div className="flex shrink-0 items-center gap-2 px-4 py-4">
        <BrandMark />
        <div className="min-w-0">
          <p className="font-heading text-sm font-semibold text-sidebar-foreground">
            DormVision
          </p>
          <p className="truncate text-xs text-sidebar-muted">
            {subtitle ?? "Your dormitory"}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {groups.map((group, i) => (
          <nav
            key={group.label ?? i}
            aria-label={group.label ?? "Navigation"}
            className={i > 0 ? "mt-4" : undefined}
          >
            {group.label && (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isItemActive(pathname, item.href);
                const Icon = item.icon;
                const badgeCount = item.badge
                  ? badgeCounts[item.badge] ?? 0
                  : 0;

                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      title={item.label}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${focusRing} ${
                        active
                          ? "bg-sidebar-active text-sidebar-foreground"
                          : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </span>
                      {badgeCount > 0 && (
                        <span
                          className="rounded-full bg-status-overdue px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
                          aria-label={`${badgeCount} pending`}
                        >
                          {badgeCount}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ))}
      </div>

      <div className="shrink-0">{footer}</div>
    </aside>
  );
}
