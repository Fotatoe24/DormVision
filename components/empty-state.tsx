import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// A friendlier "nothing here" block: says what the section is for and, when
// there's an obvious next step, offers it as a button instead of leaving the
// owner at a dead end. `bordered` is for standalone use; leave it off when
// the block already sits inside a bordered list card.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children,
  bordered = false,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  children?: ReactNode;
  bordered?: boolean;
  className?: string;
}) {
  const actionClass =
    "inline-flex items-center rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-surface transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

  return (
    <div
      className={`flex flex-col items-center px-4 py-10 text-center ${
        bordered ? "rounded-lg border border-border bg-surface" : ""
      } ${className}`}
    >
      <span
        aria-hidden
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"
      >
        <Icon className="h-5 w-5" />
      </span>

      <p className="text-sm font-medium">{title}</p>

      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-foreground-muted">
          {description}
        </p>
      )}

      {(action || children) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action &&
            (action.href.startsWith("#") ? (
              <a href={action.href} className={actionClass}>
                {action.label}
              </a>
            ) : (
              <Link href={action.href} className={actionClass}>
                {action.label}
              </Link>
            ))}
          {children}
        </div>
      )}
    </div>
  );
}
