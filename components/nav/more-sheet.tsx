"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { NavGroup } from "@/lib/navigation";
import { isItemActive } from "@/lib/navigation";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

type Badges = Record<string, number | undefined>;

/**
 * Bottom sheet listing secondary navigation destinations that don't fit
 * on the mobile bottom bar. Closes on backdrop click, Escape, or after
 * navigating to one of its links.
 */
export function MoreSheet({
  pathname,
  groups,
  open,
  onClose,
  badges = {},
}: {
  pathname: string;
  groups: NavGroup[];
  open: boolean;
  onClose: () => void;
  badges?: Badges;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    closeButtonRef.current?.focus();
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 sm:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/30"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="More navigation"
        className="absolute inset-x-0 bottom-0 flex max-h-[75vh] flex-col rounded-t-2xl border-t border-border bg-surface shadow-lg"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 4.5rem)" }}
      >
        <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-4">
          <p className="font-heading text-sm font-semibold text-foreground">
            More
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className={`rounded-md p-1 text-foreground-muted hover:text-foreground ${focusRing}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {groups.map((group, i) => {
            if (group.items.length === 0) return null;

            return (
              <div key={group.label ?? i} className={i > 0 ? "mt-4" : ""}>
                {group.label && (
                  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                    {group.label}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isItemActive(pathname, item);
                    const badge = item.badgeKey ? badges[item.badgeKey] : undefined;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={`relative flex items-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors ${focusRing} ${
                          active
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border bg-background text-foreground-muted hover:text-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.label}</span>
                        {badge ? (
                          <span className="ml-auto rounded-full bg-status-overdue px-1.5 py-0.5 text-[10px] font-semibold leading-none text-surface">
                            {badge}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
