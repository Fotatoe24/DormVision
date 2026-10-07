import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

const linkClass =
  "flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:text-foreground";
const disabledClass =
  "flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted/40";

// Prev/Next + "Page X of Y" -- no numbered page list, deliberately:
// this app's lists are dorm-scale (bills, payments, tenants), not the
// kind of thousands-of-rows dataset a numbered/ellipsis pager earns
// its complexity for.
export function PaginationControls({
  page,
  totalPages,
  hrefForPage,
}: {
  page: number;
  totalPages: number;
  hrefForPage: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex items-center justify-between"
    >
      {prevDisabled ? (
        <span className={disabledClass} aria-disabled="true">
          <ChevronLeft className="h-3.5 w-3.5" />
          Previous
        </span>
      ) : (
        <Link href={hrefForPage(page - 1)} className={linkClass}>
          <ChevronLeft className="h-3.5 w-3.5" />
          Previous
        </Link>
      )}

      <span className="text-xs text-foreground-muted">
        Page {page} of {totalPages}
      </span>

      {nextDisabled ? (
        <span className={disabledClass} aria-disabled="true">
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      ) : (
        <Link href={hrefForPage(page + 1)} className={linkClass}>
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </nav>
  );
}
