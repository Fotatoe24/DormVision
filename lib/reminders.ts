// Decides which tenants get a payment reminder or overdue notice today.
// Pure: no database, no email, no clock of its own -- the daily job (app/api/
// cron/daily) feeds it rows and does the sending, so the rules here can be
// tested exhaustively.

export type ReminderKind = "payment_reminder" | "overdue_notice";

// A reminder goes out when a bill is due within this many days (including today).
export const REMINDER_LEAD_DAYS = 3;

// Overdue notices are only for bills that went late recently. Without a limit,
// the first run would email every tenant about bills that are months old.
export const OVERDUE_LOOKBACK_DAYS = 30;

// Dorm-relative "today" as YYYY-MM-DD. Always Manila, whatever the server's own
// time zone is, so a bill "due the 1st" is judged on the 1st in the Philippines.
export function manilaToday(now: Date = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function dayNumber(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

// Whole days from `today` to `dueDate`: positive = still coming, 0 = due today,
// negative = past due.
export function daysUntil(dueDate: string, today: string) {
  return dayNumber(dueDate) - dayNumber(today);
}

// Same rule as displayBillStatus and the late-fee function in the database:
// overdue once today is past the due date plus grace days.
export function reminderKindFor(
  dueDate: string,
  graceDays: number,
  today: string
): ReminderKind | null {
  const days = daysUntil(dueDate, today);

  if (days > REMINDER_LEAD_DAYS) return null;
  if (days >= 0) return "payment_reminder";

  const daysLate = -days;
  if (daysLate <= graceDays) return null; // past due, but still inside the grace period
  if (daysLate > OVERDUE_LOOKBACK_DAYS) return null;
  return "overdue_notice";
}

export type ReminderBill = {
  id: string;
  tenant_id: string;
  dorm_id: string;
  due_date: string;
  total_amount: number | string;
  amount_paid: number | string;
  late_fee: number | string;
};

export type ReminderDormSettings = {
  graceDays: number;
  paymentReminders: boolean;
  overdueNotifications: boolean;
};

export type PlannedEmail = {
  billId: string;
  kind: ReminderKind;
  dormId: string;
  tenantId: string;
  email: string;
  name: string;
  balance: number;
  dueDate: string;
  daysUntilDue: number;
  lateFee: number;
};

export const DEFAULT_DORM_SETTINGS: ReminderDormSettings = {
  graceDays: 0,
  paymentReminders: true,
  overdueNotifications: true,
};

export function planReminders({
  bills,
  recipients,
  settings,
  alreadySent,
  today,
}: {
  bills: ReminderBill[];
  // Active tenants with a usable email, by tenants.id. Anyone missing is skipped.
  recipients: Map<string, { email: string; name: string }>;
  settings: Map<string, ReminderDormSettings>;
  // "<billId>:<kind>" for everything already sent.
  alreadySent: Set<string>;
  today: string;
}): PlannedEmail[] {
  const planned: PlannedEmail[] = [];

  for (const bill of bills) {
    const balance = Number(bill.total_amount) - Number(bill.amount_paid);
    if (balance <= 0.004) continue; // nothing owed

    const recipient = recipients.get(bill.tenant_id);
    if (!recipient) continue;

    const dorm = settings.get(bill.dorm_id) ?? DEFAULT_DORM_SETTINGS;
    const kind = reminderKindFor(bill.due_date, dorm.graceDays, today);
    if (!kind) continue;

    // The owner's Settings toggles decide whether each kind is sent at all.
    if (kind === "payment_reminder" && !dorm.paymentReminders) continue;
    if (kind === "overdue_notice" && !dorm.overdueNotifications) continue;

    if (alreadySent.has(`${bill.id}:${kind}`)) continue;

    planned.push({
      billId: bill.id,
      kind,
      dormId: bill.dorm_id,
      tenantId: bill.tenant_id,
      email: recipient.email,
      name: recipient.name,
      balance,
      dueDate: bill.due_date,
      daysUntilDue: daysUntil(bill.due_date, today),
      lateFee: Number(bill.late_fee),
    });
  }

  return planned;
}
