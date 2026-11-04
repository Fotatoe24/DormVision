"use client";

import { useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { ConfirmDialog } from "@/components/confirm-dialog";

// A button that asks "are you sure?" and collects a written reason, which goes
// to the server action as the form field `reason`. Used for the platform
// admin's consequential actions (suspend, reject, disable), whose reason is
// stored in the audit log and shown to the person affected.
//
// Place it inside the action's <form>. The dialog is portaled out of the form,
// so the typed text is kept in state and carried by a hidden input that IS in
// the form (same approach as RejectPaymentButton).
export function ReasonActionButton({
  children,
  className,
  title,
  description,
  confirmLabel,
  placeholder = "Why? This is recorded in the audit log.",
}: {
  children: ReactNode;
  className?: string;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { pending } = useFormStatus();
  const filled = reason.trim().length > 0;

  return (
    <>
      <input type="hidden" name="reason" value={reason} />

      <button
        ref={buttonRef}
        type="button"
        disabled={pending}
        aria-busy={pending}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {children}
      </button>

      <ConfirmDialog
        open={open}
        tone="danger"
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          if (!filled) return;
          setOpen(false);
          buttonRef.current?.form?.requestSubmit();
        }}
      >
        <label
          htmlFor="reason-text"
          className="mb-1 block text-xs font-medium text-foreground-muted"
        >
          Reason (required)
        </label>
        <textarea
          id="reason-text"
          rows={3}
          maxLength={300}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
        />
        {!filled && (
          <p className="mt-1 text-xs text-foreground-muted">
            Write a reason to continue.
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
