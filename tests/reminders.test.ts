import test, { mock } from "node:test";
import assert from "node:assert/strict";
import {
  OVERDUE_LOOKBACK_DAYS,
  REMINDER_LEAD_DAYS,
  daysUntil,
  manilaToday,
  planReminders,
  reminderKindFor,
  type ReminderBill,
  type ReminderDormSettings,
} from "@/lib/reminders";
import { displayBillStatus } from "@/lib/billing";

const TODAY = "2026-11-10";

test("Manila's today, not the server's: 11 PM UTC is already tomorrow in Manila", () => {
  assert.equal(manilaToday(new Date("2026-11-09T15:59:59Z")), "2026-11-09");
  assert.equal(manilaToday(new Date("2026-11-09T16:00:00Z")), "2026-11-10");
});

test("days until due counts calendar days, across months and years", () => {
  assert.equal(daysUntil("2026-11-10", "2026-11-10"), 0);
  assert.equal(daysUntil("2026-11-13", "2026-11-10"), 3);
  assert.equal(daysUntil("2026-11-01", "2026-10-30"), 2);
  assert.equal(daysUntil("2027-01-02", "2026-12-31"), 2);
  assert.equal(daysUntil("2026-11-07", "2026-11-10"), -3);
});

test("a reminder from 3 days before the due date through the due date itself", () => {
  assert.equal(reminderKindFor("2026-11-14", 0, TODAY), null); // 4 days away
  assert.equal(reminderKindFor("2026-11-13", 0, TODAY), "payment_reminder"); // 3 days
  assert.equal(reminderKindFor("2026-11-10", 0, TODAY), "payment_reminder"); // due today
  assert.equal(REMINDER_LEAD_DAYS, 3);
});

test("overdue only after due date + grace; nothing during the grace period", () => {
  assert.equal(reminderKindFor("2026-11-09", 0, TODAY), "overdue_notice"); // 1 day late, no grace
  assert.equal(reminderKindFor("2026-11-09", 3, TODAY), null); // 1 day late, 3 days grace
  assert.equal(reminderKindFor("2026-11-07", 3, TODAY), null); // the 3rd grace day
  assert.equal(reminderKindFor("2026-11-06", 3, TODAY), "overdue_notice"); // grace over
});

test("old overdue bills are not announced after the lookback window", () => {
  assert.equal(reminderKindFor("2026-10-11", 0, TODAY), "overdue_notice"); // 30 days late
  assert.equal(reminderKindFor("2026-10-10", 0, TODAY), null); // 31 days late
  assert.equal(OVERDUE_LOOKBACK_DAYS, 30);
});

test("agrees with displayBillStatus about when a bill is overdue", () => {
  process.env.TZ = "Asia/Manila";
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-10T04:00:00Z") }); // noon, Manila
  try {
    for (const grace of [0, 1, 3, 7]) {
      // within the lookback window, so the only thing that differs is the rule itself
      for (let offset = -(OVERDUE_LOOKBACK_DAYS - 1); offset <= 12; offset++) {
        const due = new Date(Date.UTC(2026, 10, 10 + offset)).toISOString().slice(0, 10);
        const appSaysOverdue = displayBillStatus({ status: "unpaid", due_date: due }, grace) === "overdue";

        assert.equal(
          reminderKindFor(due, grace, TODAY) === "overdue_notice",
          appSaysOverdue,
          `grace=${grace} due=${due}`
        );
      }
    }
  } finally {
    mock.timers.reset();
  }
});

// ---- planReminders ----

const bill = (over: Partial<ReminderBill> = {}): ReminderBill => ({
  id: "b1",
  tenant_id: "t1",
  dorm_id: "d1",
  due_date: "2026-11-12",
  total_amount: 2000,
  amount_paid: 0,
  late_fee: 0,
  ...over,
});
const recipients = new Map([["t1", { email: "ana@example.com", name: "Ana" }]]);
const settings = new Map<string, ReminderDormSettings>([
  ["d1", { graceDays: 0, paymentReminders: true, overdueNotifications: true }],
]);
const plan = (over: Partial<Parameters<typeof planReminders>[0]> = {}) =>
  planReminders({
    bills: [bill()],
    recipients,
    settings,
    alreadySent: new Set(),
    today: TODAY,
    ...over,
  });

test("plans one reminder with the balance and days left", () => {
  const [email] = plan();
  assert.equal(email.kind, "payment_reminder");
  assert.equal(email.email, "ana@example.com");
  assert.equal(email.balance, 2000);
  assert.equal(email.daysUntilDue, 2);
});

test("the balance is what is still owed, not the bill total", () => {
  assert.equal(plan({ bills: [bill({ amount_paid: 500 })] })[0].balance, 1500);
});

test("a fully paid bill gets nothing", () => {
  assert.equal(plan({ bills: [bill({ amount_paid: 2000 })] }).length, 0);
});

test("already-sent emails are never sent again, but the other kind still can be", () => {
  assert.equal(plan({ alreadySent: new Set(["b1:payment_reminder"]) }).length, 0);

  const late = bill({ due_date: "2026-11-08" });
  assert.equal(plan({ bills: [late], alreadySent: new Set(["b1:payment_reminder"]) })[0].kind, "overdue_notice");
});

test("the owner's toggles switch each kind off independently", () => {
  const off = (reminders: boolean, overdue: boolean) =>
    new Map<string, ReminderDormSettings>([["d1", { graceDays: 0, paymentReminders: reminders, overdueNotifications: overdue }]]);

  assert.equal(plan({ settings: off(false, true) }).length, 0);
  assert.equal(plan({ bills: [bill({ due_date: "2026-11-08" })], settings: off(true, false) }).length, 0);
  assert.equal(plan({ bills: [bill({ due_date: "2026-11-08" })], settings: off(false, true) }).length, 1);
});

test("a tenant with no usable email, or no settings row, is handled", () => {
  assert.equal(plan({ recipients: new Map() }).length, 0);
  assert.equal(plan({ settings: new Map() }).length, 1, "defaults: reminders on, no grace");
});

test("the late fee is passed along for the overdue email", () => {
  const [email] = plan({ bills: [bill({ due_date: "2026-11-08", late_fee: 200, total_amount: 2200 })] });
  assert.equal(email.kind, "overdue_notice");
  assert.equal(email.lateFee, 200);
  assert.equal(email.balance, 2200);
});

test("each dorm's own grace period is used", () => {
  const twoDorms = new Map<string, ReminderDormSettings>([
    ["d1", { graceDays: 0, paymentReminders: true, overdueNotifications: true }],
    ["d2", { graceDays: 5, paymentReminders: true, overdueNotifications: true }],
  ]);
  const bills = [
    bill({ id: "b1", dorm_id: "d1", due_date: "2026-11-08" }),
    bill({ id: "b2", dorm_id: "d2", due_date: "2026-11-08" }),
  ];
  const planned = plan({ bills, settings: twoDorms });
  assert.deepEqual(planned.map((p) => p.billId), ["b1"]);
});
