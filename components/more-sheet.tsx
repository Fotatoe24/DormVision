"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useDismissableOverlay } from "@/components/use-dismissable-overlay";
import type { NavGroup } from "@/lib/navigation";

function isItemActive(pathname: string, href: string) {
  const isRootRoute = href === "/admin" || href === "/tenant";
  return isRootRoute ? pathname === href : pathname.startsWith(href);
}

// Mobile-only bottom sheet for secondary navigation — the destinations
// that don't fit in the 4-item bottom nav. Reuses the same dismissable-
// overlay behavior as components/dialog.tsx (focus trap, Escape,
// backdrop, scroll lock) via the shared hook instead of a third
// hand-rolled copy of that logic.
export function MoreSheet({
  open,
  onClose,
  groups,
  pendingBadgeCount = 0,
}: {
  open: boolean;
  onClose: () => void;
  groups: NavGroup[];
  pendingBadgeCount?: number;
}) {
  const pathname = usePathname();
  const { overlayRef, closeButtonRef } = useDismissableOverlay({ open, onClose });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 sm:hidden">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/30"
      />

      <div
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        aria-label="More navigation"
        className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-xl border-t border-border bg-surface pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-5 py-3">
          <span className="font-heading text-sm font-semibold">More</span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground-muted hover:bg-surface-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-3">
          {groups.map((group, i) => (
            <div key={group.label ?? i} className={i > 0 ? "mt-4" : undefined}>
              {group.label && (
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted/70">
                  {group.label}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((item) => {
                  const active = isItemActive(pathname, item.href);
                  const Icon = item.icon;
                  const badgeCount =
                    item.badge === "pendingRequests" ? pendingBadgeCount : 0;

                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex flex-col items-start gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-foreground-muted hover:bg-surface-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                      {badgeCount > 0 && (
                        <span
                          className="absolute right-2 top-2 rounded-full bg-status-overdue px-1.5 py-0.5 text-[10px] font-semibold leading-none text-surface"
                          aria-label={`${badgeCount} pending`}
                        >
                          {badgeCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
