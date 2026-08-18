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

// For full timestamps (e.g. payments.paid_at), unlike formatBillDate
// above which is for date-only columns (bills.due_date) and needs the
// "T00:00:00" fix to avoid a timezone-driven off-by-one day.
export function formatPaymentDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
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

export const paymentMethodLabels: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  gcash: "GCash",
  other: "Other",
};

export type StandingBill = {
  due_date: string;
  status: string;
  total_amount: number | string;
  amount_paid: number | string;
};

export type AccountStanding = {
  status: "current" | "pending" | "partial" | "overdue";
  balance: number;
  nextBill: StandingBill | null;
  /** Negative when overdue, 0 when due today, positive days remaining otherwise. */
  daysUntilDue: number | null;
};

// Single source of truth for "how is this tenant's account doing right
// now" — derived from bills the same way displayBillStatus derives a
// single bill's overdue state, so the dashboard's summary card and the
// per-bill list below it can never disagree with each other.
export function getAccountStanding(bills: StandingBill[]): AccountStanding {
  const outstanding = bills.filter(
    (b) => Number(b.total_amount) - Number(b.amount_paid) > 0.004
  );

  const balance = outstanding.reduce(
    (sum, b) => sum + (Number(b.total_amount) - Number(b.amount_paid)),
    0
  );

  if (outstanding.length === 0) {
    return {
      status: "current",
      balance: 0,
      nextBill: null,
      daysUntilDue: null,
    };
  }

  const sorted = [...outstanding].sort(
    (a, b) =>
      new Date(a.due_date + "T00:00:00").getTime() -
      new Date(b.due_date + "T00:00:00").getTime()
  );
  const nextBill = sorted[0];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(nextBill.due_date + "T00:00:00");
  const daysUntilDue = Math.round((due.getTime() - today.getTime()) / 86400000);

  const isOverdue = outstanding.some((b) => displayBillStatus(b) === "overdue");
  const isPartial =
    !isOverdue && outstanding.some((b) => b.status === "partial");

  const status: AccountStanding["status"] = isOverdue
    ? "overdue"
    : isPartial
    ? "partial"
    : "pending";

  return { status, balance, nextBill, daysUntilDue };
}
