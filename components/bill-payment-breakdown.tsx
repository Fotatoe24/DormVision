"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  formatMoney,
  formatPaymentDate,
  paymentMethodLabels,
} from "@/lib/billing";

type PaymentRow = {
  id: string;
  amount: number | string;
  paid_at: string;
  method: string;
};

// Payments are passed in oldest-first so the running total accumulates
// in the order a tenant actually paid them -- the opposite order from
// Payment History elsewhere on this page, which is newest-first.
export function BillPaymentBreakdown({
  payments,
}: {
  payments: PaymentRow[];
}) {
  const [open, setOpen] = useState(false);

  if (payments.length < 2) return null;

  // Built once per render as a fresh array (no mutation of an
  // outer-scope variable across iterations) so React Compiler's
  // immutability check doesn't flag it.
  const rows = payments.reduce<
    { payment: PaymentRow; runningTotal: number }[]
  >((acc, payment) => {
    const previousTotal = acc.length > 0 ? acc[acc.length - 1].runningTotal : 0;
    return [...acc, { payment, runningTotal: previousTotal + Number(payment.amount) }];
  }, []);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
        {open ? "Hide" : "Show"} payment breakdown ({payments.length})
      </button>

      {open && (
        <div className="mt-2 space-y-1.5 rounded-md border border-border bg-background p-2.5">
          {rows.map(({ payment, runningTotal }) => (
            <div
              key={payment.id}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-foreground-muted">
                {formatPaymentDate(payment.paid_at)} ·{" "}
                {paymentMethodLabels[payment.method] ?? payment.method}
              </span>
              <span className="flex items-center gap-2 font-mono">
                <span className="text-foreground">
                  +{formatMoney(payment.amount)}
                </span>
                <span className="text-foreground-muted">
                  ({formatMoney(runningTotal)})
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
