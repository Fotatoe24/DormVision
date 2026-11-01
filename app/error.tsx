"use client";

import { ErrorState } from "@/components/error-state";

// Root error boundary: the last line of defense, for anything that throws
// outside the owner/tenant/profile areas (which have their own boundaries
// so they keep their navigation) or inside their layouts.
export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorState
      fullScreen
      error={error}
      onRetry={unstable_retry}
      homeHref="/"
      homeLabel="Go to sign in"
    />
  );
}
