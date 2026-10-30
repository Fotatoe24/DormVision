"use client";

import { useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { ConfirmDialog } from "@/components/confirm-dialog";

// "Reject" for a tenant-reported payment: asks for confirmation AND lets the
// owner leave a short reason, which the tenant then sees on their Billing
// page and in the rejection email.
//
// Place it inside the reject <form>. The confirm dialog is portaled out of
// the form, so the typed note is kept in state and carried by a hidden
// input that IS inside the form.
export function RejectPaymentButton({
  children,
  className,
  description,
}: {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { pending } = useFormStatus();

  return (
    <>
      <input type="hidden" name="reviewNote" value={note} />

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
        title="Reject this payment report?"
        description={description}
        confirmLabel="Reject payment"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          buttonRef.current?.form?.requestSubmit();
        }}
      >
        <label
          htmlFor="reject-note"
          className="mb-1 block text-xs font-medium text-foreground-muted"
        >
          Reason for the tenant (optional)
        </label>
        <textarea
          id="reject-note"
          rows={3}
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. The reference number is cut off, please resend."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </ConfirmDialog>
    </>
  );
}
