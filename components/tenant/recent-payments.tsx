import { formatMoney, formatPaymentDate, paymentMethodLabels } from "@/lib/billing";

type Payment = {
  id: string;
  amount: number | string;
  method: string;
  paid_at: string;
};

export function RecentPayments({ payments }: { payments: Payment[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <div className="border-b border-border px-6 py-4">
        <p className="font-heading text-sm font-semibold">Recent payments</p>
      </div>

      {payments.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-sm font-medium text-foreground">
            No payment history yet.
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            Your completed payments will appear here.
          </p>
        </div>
      ) : (
        <div>
          {payments.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center justify-between px-6 py-3 ${
                i < payments.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div>
                <p className="text-sm text-foreground">{formatPaymentDate(p.paid_at)}</p>
                <p className="text-xs text-foreground-muted">
                  {paymentMethodLabels[p.method] ?? p.method}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-foreground">
                  {formatMoney(p.amount)}
                </span>
                <span className="rounded-full bg-status-paid/15 px-2.5 py-0.5 text-xs font-medium text-status-paid">
                  Paid
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
