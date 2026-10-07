"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useDismissableOverlay } from "@/components/use-dismissable-overlay";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";
const labelClass = "mb-1.5 block text-xs font-medium text-foreground-muted";
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

const categoryOptions = [
  { group: "Income", options: [{ value: "other_income", label: "Other income" }] },
  {
    group: "Expense",
    options: [
      { value: "utilities", label: "Utilities" },
      { value: "repairs", label: "Repairs & maintenance" },
      { value: "supplies", label: "Supplies" },
      { value: "other_expense", label: "Other expense" },
    ],
  },
];

export type TransactionFormValues = {
  id?: string;
  type: "income" | "expense";
  category: string;
  amount: string;
  description: string;
  occurredAt: string;
};

const emptyValues: TransactionFormValues = {
  type: "expense",
  category: "",
  amount: "",
  description: "",
  occurredAt: new Date().toISOString().slice(0, 10),
};

// Shared Add/Edit modal — createTransaction and updateTransaction take
// identical fields (updateTransaction just adds a hidden transactionId),
// so one form covers both; `action` and `initialValues` are the only
// things that differ between the two call sites.
//
// Supports an uncontrolled mode (pass `trigger`, the component manages
// its own open state -- used for "Add transaction") and a controlled
// mode (pass `open`/`onOpenChange`, no `trigger` -- used for "Edit",
// where the trigger button lives inside TransactionRowMenu's dropdown.
// That dropdown unmounts itself on the same click that would open an
// uncontrolled modal nested inside it, closing the modal before it
// could ever show -- the modal has to be rendered outside that
// conditional block instead, which only the controlled mode allows).
export function TransactionModal({
  trigger,
  title,
  action,
  initialValues,
  open: openProp,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  title: string;
  action: (formData: FormData) => void;
  initialValues?: TransactionFormValues;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = isControlled ? onOpenChange! : setInternalOpen;

  const values = initialValues ?? emptyValues;
  const { overlayRef, closeButtonRef } = useDismissableOverlay({
    open,
    onClose: () => setOpen(false),
  });

  return (
    <>
      {trigger && <span onClick={() => setOpen(true)}>{trigger}</span>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-foreground/30"
          />

          <div
            ref={overlayRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative z-10 w-full max-w-md rounded-lg border border-border bg-surface shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <p className="font-heading text-sm font-semibold">{title}</p>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className={`flex h-8 w-8 items-center justify-center rounded-md text-foreground-muted hover:bg-surface-muted hover:text-foreground ${focusRing}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              action={action}
              onSubmit={() => setOpen(false)}
              className="space-y-4 p-5"
            >
              {values.id && (
                <input type="hidden" name="transactionId" value={values.id} />
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="type" className={labelClass}>
                    Type
                  </label>
                  <select
                    id="type"
                    name="type"
                    required
                    defaultValue={values.type}
                    className={inputClass}
                  >
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="category" className={labelClass}>
                    Category
                  </label>
                  <select
                    id="category"
                    name="category"
                    required
                    defaultValue={values.category}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Select a category…
                    </option>
                    {categoryOptions.map((group) => (
                      <optgroup key={group.group} label={group.group}>
                        {group.options.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="amount" className={labelClass}>
                    Amount
                  </label>
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    defaultValue={values.amount}
                    className={`${inputClass} font-mono`}
                  />
                </div>

                <div>
                  <label htmlFor="occurredAt" className={labelClass}>
                    Date
                  </label>
                  <input
                    id="occurredAt"
                    name="occurredAt"
                    type="date"
                    required
                    defaultValue={values.occurredAt}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="description" className={labelClass}>
                  Description (optional)
                </label>
                <input
                  id="description"
                  name="description"
                  type="text"
                  defaultValue={values.description}
                  placeholder="e.g. Electric bill for March"
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-md bg-primary py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
              >
                {values.id ? "Save changes" : "Add transaction"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
