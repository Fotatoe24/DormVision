"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCw } from "lucide-react";

// Shown in place of a page whose data couldn't be loaded. Says what failed
// in plain words and offers a retry, instead of printing the database's own
// error text. (The real error is logged on the server by the page.)
export function LoadError({ what }: { what: string }) {
  const router = useRouter();

  return (
    <div
      role="alert"
      className="rounded-lg border border-status-overdue/30 bg-status-overdue/10 px-4 py-8 text-center"
    >
      <span
        aria-hidden
        className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-status-overdue/15 text-status-overdue"
      >
        <AlertTriangle className="h-5 w-5" />
      </span>

      <p className="text-sm font-medium text-foreground">
        We couldn&apos;t load {what}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-foreground-muted">
        This is usually temporary. Check your connection and try again.
      </p>

      <button
        type="button"
        onClick={() => router.refresh()}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-surface transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <RotateCw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  );
}
