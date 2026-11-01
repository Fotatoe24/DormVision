"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";

// The friendly screen behind every error.tsx boundary. It deliberately does
// NOT print error.message: for errors thrown on the server Next already
// replaces it with a generic string, and for anything else it is developer
// text. The `digest` is shown instead as a short reference that matches the
// server-side log entry, which is what someone helping the user would need.
export function ErrorState({
  error,
  onRetry,
  homeHref,
  homeLabel,
  fullScreen = false,
}: {
  error: Error & { digest?: string };
  onRetry: () => void;
  homeHref?: string;
  homeLabel?: string;
  // The root boundary has no sidebar around it, so it centers on the page.
  fullScreen?: boolean;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      className={
        fullScreen
          ? "flex min-h-full flex-1 items-center justify-center bg-background px-6 py-12"
          : "px-2 py-10"
      }
    >
      <div
        role="alert"
        className="mx-auto w-full max-w-md rounded-lg border border-status-overdue/30 bg-status-overdue/10 p-6 text-center"
      >
        <span
          aria-hidden
          className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-status-overdue/15 text-status-overdue"
        >
          <AlertTriangle className="h-5 w-5" />
        </span>

        <p className="font-heading text-sm font-semibold text-foreground">
          Something went wrong
        </p>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-foreground-muted">
          We couldn&apos;t show this page. Your data is safe. Try again, and if
          it keeps happening, let your dorm owner or support know.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-surface transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Try again
          </button>

          {homeHref && (
            <Link
              href={homeHref}
              className="rounded-md border border-border bg-surface px-4 py-2 text-xs font-medium text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {homeLabel ?? "Go home"}
            </Link>
          )}
        </div>

        {error.digest && (
          <p className="mt-4 text-xs text-foreground-muted">
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}
