"use client";

import { useEffect } from "react";

// Root error boundary — catches any uncaught exception thrown by a
// server component below the root layout (e.g. a Supabase call that
// throws instead of returning { error }), which previously fell
// through to Next's unstyled default error screen.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm rounded-lg border border-status-overdue/30 bg-status-overdue/10 p-6 text-center">
        <p className="font-heading text-sm font-semibold text-status-overdue">
          Something went wrong
        </p>
        <p className="mt-1 text-xs text-foreground-muted">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
