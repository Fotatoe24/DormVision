"use client";

import { useEffect, useRef, useState } from "react";
import { X, Phone, Mail, Banknote } from "lucide-react";

// DormVision doesn't process online payments (see README: viewing only,
// unless scope expands) -- so "Pay Now" can't open a checkout flow. What
// it CAN honestly do is surface how to actually pay: the dorm's contact
// details and accepted methods, both of which are real data already on
// `dormitories` and the `payment_method` enum. This is a self-contained
// modal (local state) rather than the router-based `Dialog` used for
// intercepted routes elsewhere, since there's no dedicated route for it.
const methods = [
  { key: "cash", label: "Cash", note: "Pay in person at the dorm office." },
  { key: "bank_transfer", label: "Bank transfer", note: "Ask your dorm owner for account details." },
  { key: "gcash", label: "GCash", note: "Ask your dorm owner for their GCash number." },
];

export function PayNowButton({
  dormName,
  contactNumber,
  contactEmail,
}: {
  dormName?: string | null;
  contactNumber?: string | null;
  contactEmail?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-surface transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto sm:px-6"
      >
        Pay now
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-foreground/30"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="How to pay"
            className="relative z-10 w-full max-w-sm rounded-t-lg border border-border bg-background shadow-lg sm:rounded-lg"
          >
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-md text-foreground-muted hover:bg-surface-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="max-h-[85vh] overflow-y-auto p-6">
              <p className="mb-1 font-heading text-sm font-semibold text-foreground">
                How to pay
              </p>
              <p className="mb-4 text-xs text-foreground-muted">
                {dormName ?? "Your dormitory"} accepts these payment methods.
                Payments are recorded by your dorm owner once received.
              </p>

              <div className="mb-4 space-y-2">
                {methods.map((m) => (
                  <div
                    key={m.key}
                    className="flex items-start gap-2.5 rounded-md border border-border bg-surface p-3"
                  >
                    <Banknote
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">{m.label}</p>
                      <p className="text-xs text-foreground-muted">{m.note}</p>
                    </div>
                  </div>
                ))}
              </div>

              {(contactNumber || contactEmail) && (
                <div className="rounded-md bg-surface-muted p-3">
                  <p className="mb-2 text-xs font-medium text-foreground-muted">
                    Contact your dorm owner
                  </p>
                  <div className="space-y-1.5">
                    {contactNumber && (
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <Phone className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
                        {contactNumber}
                      </div>
                    )}
                    {contactEmail && (
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <Mail className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
                        {contactEmail}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
