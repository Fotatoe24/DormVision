"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Drop-in replacement for <button type="submit"> inside a server-action
// form: disables itself while the action runs (so a slow connection can't
// double-submit a payment or bill) and shows a spinner. With `pendingText`
// the label is swapped; without it the original label stays put beside the
// spinner, so small inline buttons don't change meaning or jump around.
export function SubmitButton({
  children,
  pendingText,
  className,
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span
            aria-hidden
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {pendingText ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
