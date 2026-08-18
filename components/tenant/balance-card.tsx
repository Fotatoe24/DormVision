import { formatMoney, formatBillDate, type AccountStanding } from "@/lib/billing";
import { PayNowButton } from "@/components/tenant/pay-now-dialog";

export function BalanceCard({
  standing,
  dormName,
  contactNumber,
  contactEmail,
}: {
  standing: AccountStanding;
  dormName?: string | null;
  contactNumber?: string | null;
  contactEmail?: string | null;
}) {
  const { status, balance, nextBill, daysUntilDue } = standing;

  if (status === "current") {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <p className="mb-1 text-xs font-medium text-foreground-muted">
          Current balance
        </p>
        <p className="font-heading text-4xl font-semibold text-foreground">
          {formatMoney(0)}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-status-paid">
          You&apos;re all caught up
          <span aria-hidden="true">✓</span>
        </p>
      </div>
    );
  }

  const isOverdue = status === "overdue";
  const overdueDays = isOverdue && daysUntilDue !== null ? Math.abs(daysUntilDue) : 0;

  return (
    <div
      className={`rounded-lg border p-6 ${
        isOverdue
          ? "border-status-overdue/30 bg-status-overdue/5"
          : "border-border bg-surface"
      }`}
    >
      <p className="mb-1 text-xs font-medium text-foreground-muted">
        {isOverdue ? "Outstanding balance" : "Current balance"}
      </p>
      <p className="font-heading text-4xl font-semibold text-foreground">
        {formatMoney(balance)}
      </p>

      {nextBill && (
        <p
          className={`mt-2 text-sm ${
            isOverdue ? "font-medium text-status-overdue" : "text-foreground-muted"
          }`}
        >
          {isOverdue
            ? `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}`
            : `Due ${formatBillDate(nextBill.due_date)}`}
        </p>
      )}

      <div className="mt-4">
        <PayNowButton
          dormName={dormName}
          contactNumber={contactNumber}
          contactEmail={contactEmail}
        />
      </div>
    </div>
  );
}
