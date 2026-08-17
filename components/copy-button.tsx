"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

// Generic clipboard-copy button with a brief "Copied!" confirmation —
// not tied to the join code specifically, so it's reusable anywhere a
// short value (an ID, a code) needs a one-click copy.
export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (permissions, insecure context) —
      // nothing destructive happens either way, just no confirmation.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={copied ? "Copied to clipboard" : label}
      className={`flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:text-foreground ${focusRing}`}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-status-paid" />
          <span className="text-status-paid">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          {label}
        </>
      )}
    </button>
  );
}
