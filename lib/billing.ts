export const billStatusStyles: Record<string, string> = {
  paid: "bg-status-paid/15 text-status-paid",
  partial: "bg-status-partial/15 text-status-partial",
  unpaid: "bg-status-unpaid/15 text-status-unpaid",
  overdue: "bg-status-overdue/15 text-status-overdue",
};

export function formatMoney(n: number | string) {
  return `₱${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatBillDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// A bill is treated as overdue in the UI whenever it's past its due date
// and not fully paid — this is derived at render time rather than stored,
// since there's no background job to flip a persisted status on a schedule.
export function displayBillStatus(bill: { status: string; due_date: string }) {
  const isPastDue = new Date(bill.due_date + "T00:00:00") < new Date();
  if (bill.status !== "paid" && isPastDue) return "overdue";
  return bill.status;
}
