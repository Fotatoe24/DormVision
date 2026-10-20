import { BrandMark } from "@/components/brand-mark";
import {
  billStatusStyles,
  formatMoney,
  formatBillDate,
  formatPaymentDate,
  paymentMethodLabels,
} from "@/lib/billing";
import type { InvoiceData } from "@/lib/invoices";

// The on-screen (and print-media) invoice layout. Counterpart to
// components/receipt-document.tsx -- same plain HTML/Tailwind
// approach for real, selectable print output, same split from the
// @react-pdf/renderer version (components/invoice-pdf-document.tsx)
// driven by the same InvoiceData.
export function InvoiceDocument({ data }: { data: InvoiceData }) {
  return (
    <div className="mx-auto w-full max-w-2xl rounded-lg border border-border bg-surface p-8 text-foreground sm:p-10 print:max-w-none print:rounded-none print:border-none print:p-0">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            INVOICE
          </h1>
          <div className="mt-3 text-sm font-medium text-foreground-muted">
            <p className="text-foreground">{data.dorm.name}</p>
            {data.dorm.address && <p>{data.dorm.address}</p>}
            {data.dorm.contactNumber && <p>{data.dorm.contactNumber}</p>}
            {data.dorm.email && <p>{data.dorm.email}</p>}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <BrandMark className="ml-auto h-14 w-14" />
          <p className="mt-2 text-sm">
            <span className="font-semibold text-foreground">Invoice #:</span>{" "}
            <span className="font-mono text-foreground-muted">
              {data.invoiceNumber}
            </span>
          </p>
          <p className="text-sm">
            <span className="font-semibold text-foreground">Issued:</span>{" "}
            <span className="text-foreground-muted">
              {formatPaymentDate(data.issuedAt)}
            </span>
          </p>
          <span
            className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${billStatusStyles[data.status]}`}
          >
            {data.status}
          </span>
        </div>
      </div>

      {/* Tenant / room details */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Billed to
          </p>
          <p className="text-sm font-medium text-foreground">
            {data.tenant.fullName}
          </p>
          {data.room.roomNumber && (
            <p className="text-sm text-foreground-muted">
              Room {data.room.roomNumber}
            </p>
          )}
        </div>

        <div className="sm:text-right">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Billing period
          </p>
          <p className="text-sm text-foreground-muted">
            {formatBillDate(data.billingPeriod.start)} –{" "}
            {formatBillDate(data.billingPeriod.end)}
          </p>
          <p className="text-sm font-medium text-foreground">
            Due {formatBillDate(data.billingPeriod.dueDate)}
          </p>
        </div>
      </div>

      {/* Line items */}
      <div className="mb-8 overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              <th className="px-4 py-2.5">No.</th>
              <th className="px-4 py-2.5">Description</th>
              <th className="px-4 py-2.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.lineItems.map((item, i) => (
              <tr
                key={item.label}
                className={i > 0 ? "border-t border-border" : ""}
              >
                <td className="px-4 py-2.5 text-foreground-muted">{i + 1}</td>
                <td className="px-4 py-2.5">{item.label}</td>
                <td className="px-4 py-2.5 text-right font-mono">
                  {formatMoney(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payments applied so far -- omitted entirely for an unpaid
          bill with nothing yet to show. */}
      {data.payments.length > 0 && (
        <div className="mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Payments applied
          </p>
          <div className="space-y-1 rounded-md border border-border p-3">
            {data.payments.map((p, i) => (
              <div
                key={`${p.paidAt}-${i}`}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-foreground-muted">
                  {formatPaymentDate(p.paidAt)} ·{" "}
                  {paymentMethodLabels[p.method] ?? p.method}
                </span>
                <span className="font-mono text-status-paid">
                  {formatMoney(p.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Amount summary */}
      <div className="mb-8 ml-auto w-full max-w-xs space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-foreground-muted">Invoice total</span>
          <span className="font-mono">{formatMoney(data.total)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-1.5">
          <span className="text-foreground-muted">Paid to date</span>
          <span className="font-mono text-status-paid">
            {formatMoney(data.amountPaid)}
          </span>
        </div>

        <div
          className={`mt-3 flex items-center justify-between rounded-md px-4 py-3 text-surface ${
            data.balanceDue > 0.004 ? "bg-status-overdue" : "bg-status-paid"
          }`}
        >
          <span className="font-semibold">
            {data.balanceDue > 0.004 ? "Balance due" : "Paid in full"}
          </span>
          <span className="font-mono text-lg font-bold">
            {formatMoney(data.balanceDue > 0.004 ? data.balanceDue : data.total)}
          </span>
        </div>
      </div>

      <p className="text-center text-sm font-medium text-foreground-muted">
        {data.balanceDue > 0.004
          ? "Please settle this balance by the due date above."
          : "Thank you — this invoice is fully settled."}
      </p>
    </div>
  );
}
