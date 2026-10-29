"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import { AlertTriangle } from "lucide-react";

const FOCUSABLE_SELECTOR =
  "button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
};

// Controlled "are you sure?" dialog. Rendered through a portal so it works
// from inside other modals and dropdown menus, and it handles Escape in the
// capture phase so closing it never also closes a modal underneath (the
// intercepted-route Dialog listens for Escape on `document`).
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;

    const trigger = document.activeElement as HTMLElement | null;
    // Default focus lands on Cancel so a stray Enter never confirms.
    cancelRef.current?.focus();

    // Only lock scroll if nothing else (e.g. a parent modal) already has.
    const previousOverflow = document.body.style.overflow;
    if (!previousOverflow) document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCancel();
        return;
      }

      if (e.key === "Tab" && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const danger = tone === "danger";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cancel"
        onClick={onCancel}
        className="fixed inset-0 bg-foreground/40"
      />

      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-lg"
      >
        <div className="flex gap-3">
          <span
            aria-hidden
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              danger
                ? "bg-status-overdue/15 text-status-overdue"
                : "bg-primary/15 text-primary"
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
          </span>

          <div className="min-w-0">
            <p id={titleId} className="font-heading text-sm font-semibold">
              {title}
            </p>
            {description && (
              <p
                id={descId}
                className="mt-1 text-xs leading-relaxed text-foreground-muted"
              >
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className={`rounded-md border border-border bg-background px-3.5 py-2 text-xs font-medium text-foreground-muted hover:text-foreground ${focusRing}`}
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-3.5 py-2 text-xs font-medium text-surface hover:opacity-90 ${focusRing} ${
              danger ? "bg-status-overdue" : "bg-primary"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// A submit button that asks first. Place it inside the <form> exactly where
// the plain submit button was: clicking opens the confirm dialog, and only
// "Confirm" submits the surrounding form (with all its hidden inputs).
export function ConfirmSubmitButton({
  children,
  className,
  title,
  description,
  confirmLabel,
  tone = "danger",
}: {
  children: ReactNode;
  className?: string;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "default";
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { pending } = useFormStatus();

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={pending}
        aria-busy={pending}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {pending ? (
          <span className="inline-flex items-center justify-center gap-2">
            <span
              aria-hidden
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            {children}
          </span>
        ) : (
          children
        )}
      </button>

      <ConfirmDialog
        open={open}
        title={title}
        description={description}
        confirmLabel={confirmLabel ?? (typeof children === "string" ? children : "Confirm")}
        tone={tone}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          buttonRef.current?.form?.requestSubmit();
        }}
      />
    </>
  );
}
