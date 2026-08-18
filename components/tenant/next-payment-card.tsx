import { formatMoney, formatBillDate, type AccountStanding } from "@/lib/billing";

export function NextPaymentCard({ standing }: { standing: AccountStanding }) {
  const { nextBill, daysUntilDue } = standing;

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <p className="mb-3 font-heading text-sm font-semibold">Next payment</p>

      {!nextBill ? (
        <p className="text-sm text-foreground-muted">
          Nothing due right now. New bills will show up here as soon as
          your dorm owner generates them.
        </p>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              {formatBillDate(nextBill.due_date)}
            </p>
            <p className="text-xs text-foreground-muted">
              {daysUntilDue === null
                ? ""
                : daysUntilDue < 0
                  ? `${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? "" : "s"} overdue`
                  : daysUntilDue === 0
                    ? "Due today"
                    : `${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"} remaining`}
            </p>
          </div>
          <span className="font-mono text-sm font-medium text-accent">
            {formatMoney(Number(nextBill.total_amount) - Number(nextBill.amount_paid))}
          </span>
        </div>
      )}
    </div>
  );
}
