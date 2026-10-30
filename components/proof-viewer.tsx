"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, ImageIcon, X } from "lucide-react";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

// Shows a payment-proof image from a short-lived signed URL (see
// lib/payment-proofs.ts): a small thumbnail, or a text link for tight rows,
// that opens the full-size original in a lightbox.
//
// Deliberately a plain <img>, not next/image: the goal is to show the
// original file untouched. next/image would route it through the optimizer
// (resizing + re-encoding), and a signed URL isn't an allow-listed remote
// pattern anyway.
export function ProofViewer({
  url,
  label,
  variant = "thumb",
}: {
  url: string;
  // e.g. "Maria Santos, ₱3,500" -- used for the accessible names.
  label: string;
  variant?: "thumb" | "link";
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const trigger = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    if (!previousOverflow) document.body.style.overflow = "hidden";

    // Capture phase, so closing the lightbox never also closes a modal
    // underneath it (same reasoning as components/confirm-dialog.tsx).
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.stopImmediatePropagation();
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  return (
    <>
      {variant === "thumb" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`View payment proof: ${label}`}
          aria-haspopup="dialog"
          className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-surface-muted ${focusRing}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain"
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className={`inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline ${focusRing}`}
        >
          <ImageIcon className="h-3 w-3" />
          View proof
        </button>
      )}

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-foreground/60"
            />

            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Payment proof: ${label}`}
              className="relative z-10 flex max-h-full w-full max-w-3xl flex-col rounded-xl border border-border bg-surface shadow-lg"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <p className="min-w-0 truncate text-sm font-medium">{label}</p>

                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground-muted hover:text-foreground ${focusRing}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open original
                  </a>

                  <button
                    ref={closeRef}
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className={`flex h-8 w-8 items-center justify-center rounded-md text-foreground-muted hover:bg-surface-muted hover:text-foreground ${focusRing}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto bg-surface-muted p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Payment proof: ${label}`}
                  className="mx-auto max-h-[75vh] w-auto max-w-full object-contain"
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
