import { BrandMark } from "@/components/brand-mark";
import {
  formatMoney,
  formatBillDate,
  formatPaymentDate,
  paymentMethodLabels,
} from "@/lib/billing";
import type { ReceiptData } from "@/lib/receipts";

// The on-screen (and print-media) receipt layout. Deliberately plain
// HTML/Tailwind rather than anything canvas- or screenshot-based, so
// browser printing (Ctrl+P / the Print button) produces real,
// selectable text -- the PDF download uses a separate
// @react-pdf/renderer version (components/receipt-pdf-document.tsx)
// driven by the exact same ReceiptData, since react-pdf can't render
// regular JSX/Tailwind.
export function ReceiptDocument({ data }: { data: ReceiptData }) {
  return (
    <div className="mx-auto w-full max-w-2xl rounded-lg border border-border bg-surface p-8 text-foreground sm:p-10 print:max-w-none print:rounded-none print:border-none print:p-0">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            RECEIPT
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
            <span className="font-semibold text-foreground">Receipt #:</span>{" "}
            <span className="font-mono text-foreground-muted">
              {data.receiptNumber}
            </span>
          </p>
          <p className="text-sm">
            <span className="font-semibold text-foreground">Date:</span>{" "}
            <span className="text-foreground-muted">
              {formatPaymentDate(data.issuedAt)}
            </span>
          </p>
        </div>
      </div>

      {/* Tenant / room details */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Tenant
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
          <p className="text-sm text-foreground-muted">
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

      {data.payment.notes && (
        <div className="mb-8">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Note
          </p>
          <p className="text-sm text-foreground-muted">{data.payment.notes}</p>
        </div>
      )}

      {/* Payment summary */}
      <div className="mb-8 ml-auto w-full max-w-xs space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-foreground-muted">Bill total</span>
          <span className="font-mono">{formatMoney(data.billTotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-foreground-muted">This payment</span>
          <span className="font-mono text-status-paid">
            {formatMoney(data.payment.amount)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-foreground-muted">Paid to date</span>
          <span className="font-mono">
            {formatMoney(data.billAmountPaidCumulative)}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-1.5">
          <span className="text-foreground-muted">
            {data.billRemaining > 0 ? "Remaining balance" : "Status"}
          </span>
          <span
            className={`font-mono font-medium ${
              data.billRemaining > 0
                ? "text-status-overdue"
                : "text-status-paid"
            }`}
          >
            {data.billRemaining > 0
              ? formatMoney(data.billRemaining)
              : "Fully paid"}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-md bg-primary px-4 py-3 text-surface">
          <span className="font-semibold">Amount paid</span>
          <span className="font-mono text-lg font-bold">
            {formatMoney(data.payment.amount)}
          </span>
        </div>

        <div className="flex items-center justify-between pt-1 text-xs text-foreground-muted">
          <span>
            Paid via{" "}
            {paymentMethodLabels[data.payment.method] ?? data.payment.method}
          </span>
          <span className="font-medium text-status-paid">Confirmed</span>
        </div>
      </div>

      <p className="text-center text-sm font-medium text-foreground-muted">
        Thank you for your payment.
      </p>
    </div>
  );
}
