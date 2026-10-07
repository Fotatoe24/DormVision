"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { TransactionModal, type TransactionFormValues } from "@/components/transaction-modal";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

// Edit/Delete for one transaction row. Only ever rendered for rows
// backed by a real transactions.id -- payment-sourced (rent) rows in
// the unified feed have no menu at all, since editing/deleting an
// actual payment belongs on Billing/Payments, not here.
export function TransactionRowMenu({
  values,
  updateAction,
  deleteAction,
}: {
  values: TransactionFormValues;
  updateAction: (formData: FormData) => void;
  deleteAction: (formData: FormData) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Transaction actions"
        className={`flex h-7 w-7 items-center justify-center rounded-md text-foreground-muted hover:bg-surface-muted hover:text-foreground ${focusRing}`}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-border bg-surface p-1.5 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setEditOpen(true);
            }}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground ${focusRing}`}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>

          <form action={deleteAction} onSubmit={() => setMenuOpen(false)}>
            <input type="hidden" name="transactionId" value={values.id} />
            <button
              type="submit"
              role="menuitem"
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-status-overdue hover:bg-status-overdue/10 ${focusRing}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </form>
        </div>
      )}

      {/* Rendered unconditionally (not inside {menuOpen && ...}) so
          closing the dropdown above doesn't unmount this before it
          can open -- see TransactionModal's controlled-mode comment. */}
      <TransactionModal
        title="Edit transaction"
        action={updateAction}
        initialValues={values}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
