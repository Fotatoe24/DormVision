"use client";

import Link from "next/link";
import type { NavGroup } from "@/lib/navigation";
import { isItemActive } from "@/lib/navigation";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

type Badges = Record<string, number | undefined>;

/**
 * Full desktop navigation list, grouped with optional small-caps headings.
 * Every real route is shown directly — nothing is tucked away here, that's
 * what the mobile "More" sheet is for.
 */
export function SidebarNav({
  pathname,
  label,
  groups,
  badges = {},
  onNavigate,
}: {
  pathname: string;
  label: string;
  groups: NavGroup[];
  badges?: Badges;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label={label} className="px-3">
      {groups.map((group, i) => (
        <div key={group.label ?? i} className={i > 0 ? "mt-4" : ""}>
          {group.label && (
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted/70">
              {group.label}
            </p>
          )}

          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;

              if (item.comingSoon) {
                return (
                  <li key={item.label}>
                    <span
                      aria-disabled="true"
                      title="Coming soon"
                      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground-muted/70"
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground-muted">
                        Soon
                      </span>
                    </span>
                  </li>
                );
              }

              const isActive = isItemActive(pathname, item);
              const badge = item.badgeKey ? badges[item.badgeKey] : undefined;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    title={item.label}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${focusRing} ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-foreground-muted hover:bg-surface-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge ? (
                      <span
                        className="rounded-full bg-status-overdue px-1.5 py-0.5 text-[10px] font-semibold leading-none text-surface"
                        aria-label={`${badge} pending`}
                      >
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
