"use client";

import { ErrorState } from "@/components/error-state";

// Sits below app/profile/layout.tsx, so when a page in this area throws, the
// sidebar and navigation stay on screen and only the page content is
// replaced by this message. (A failure inside the layout itself still falls
// through to app/error.tsx.)
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorState
      error={error}
      onRetry={unstable_retry}
      homeHref="/"
      homeLabel="Go home"
    />
  );
}
