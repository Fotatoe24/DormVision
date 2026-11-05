import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { register } from "@/instrumentation";
import {
  toDateString,
  displayBillStatus,
  getAccountStanding,
  formatPaymentDate,
} from "@/lib/billing";

// The server (Vercel) runs in UTC; the dorms are in Manila (UTC+8). These tests
// stand in for that server: they force the process to UTC, freeze the clock at
// specific instants around Manila midnight, and check what the app decides.
//
//   2026-10-31T17:30:00Z  =  Nov 1, 01:30 in Manila   (late Oct 31 in UTC)
//   2026-11-01T16:30:00Z  =  Nov 2, 00:30 in Manila   (still Nov 1 in UTC)

const at = (iso: string) => {
  mock.timers.reset(); // so a test can move the clock more than once
  mock.timers.enable({ apis: ["Date"], now: Date.parse(iso) });
};

test.afterEach(() => mock.timers.reset());

test("a plain UTC server dates 1:30 AM Nov 1 (Manila) as Oct 31 -- the bug", () => {
  process.env.TZ = "UTC";
  at("2026-10-31T17:30:00Z");

  assert.equal(toDateString(new Date()), "2026-10-31");
});

test("register() moves the server to Manila time", () => {
  process.env.TZ = "UTC";
  void register();
  at("2026-10-31T17:30:00Z");

  assert.equal(process.env.TZ, "Asia/Manila");
  assert.equal(toDateString(new Date()), "2026-11-01");
});

test("the billing month and 'today' are Manila's after register()", async () => {
  process.env.TZ = "UTC";
  await register();
  at("2026-10-31T17:30:00Z"); // 1:30 AM on the 1st, Manila

  const now = new Date();
  assert.deepEqual([now.getFullYear(), now.getMonth() + 1, now.getDate()], [2026, 11, 1]);
});

test("payment timestamps are shown in Manila time even on a UTC machine", () => {
  process.env.TZ = "UTC"; // no register(): the formatter itself must be right
  assert.equal(formatPaymentDate("2026-10-31T17:30:00Z"), "Nov 1, 2026");
  assert.equal(formatPaymentDate("2026-11-01T15:59:00Z"), "Nov 1, 2026"); // 11:59 PM Manila
  assert.equal(formatPaymentDate("2026-11-01T16:00:00Z"), "Nov 2, 2026"); // midnight Manila
});

const bill = (due: string, status = "unpaid") => ({ status, due_date: due });

test("a bill due TODAY is not overdue yet", async () => {
  await register();
  at("2026-11-01T02:00:00Z"); // 10:00 AM Nov 1, Manila

  assert.equal(displayBillStatus(bill("2026-11-01")), "unpaid");
});

test("a bill is overdue from the day AFTER its due date", async () => {
  await register();
  at("2026-11-01T15:59:00Z"); // 11:59 PM Nov 1, Manila: still the due date
  assert.equal(displayBillStatus(bill("2026-11-01")), "unpaid");

  at("2026-11-01T16:00:00Z"); // midnight: Nov 2 starts
  assert.equal(displayBillStatus(bill("2026-11-01")), "overdue");
});

test("a bill that is paid is never overdue", async () => {
  await register();
  at("2026-12-25T00:00:00Z");

  assert.equal(displayBillStatus(bill("2026-11-01", "paid")), "paid");
});

test("grace days push the overdue date back", async () => {
  await register();

  at("2026-11-03T16:00:00Z"); // Nov 4, 00:00 Manila: 3 days after the due date
  assert.equal(displayBillStatus(bill("2026-11-01"), 3), "unpaid"); // the 3rd day of grace is Nov 4

  at("2026-11-04T16:00:00Z"); // Nov 5, 00:00 Manila
  assert.equal(displayBillStatus(bill("2026-11-01"), 3), "overdue");
});

test("'due today' and 'overdue' never contradict each other", async () => {
  await register();
  at("2026-11-01T02:00:00Z"); // 10 AM on the due date

  const standing = getAccountStanding([
    { status: "unpaid", due_date: "2026-11-01", total_amount: 3500, amount_paid: 0 },
  ]);

  assert.equal(standing.daysUntilDue, 0);
  assert.notEqual(standing.status, "overdue");
});

test("days until due counts from Manila's today, not UTC's", async () => {
  await register();
  at("2026-10-31T17:30:00Z"); // 1:30 AM Nov 1 in Manila

  const standing = getAccountStanding([
    { status: "unpaid", due_date: "2026-11-02", total_amount: 3500, amount_paid: 0 },
  ]);

  assert.equal(standing.daysUntilDue, 1); // due tomorrow, not "in 2 days"
});

test("the dashboard standing respects the grace period too", async () => {
  await register();
  const bills = [
    { status: "unpaid", due_date: "2026-11-01", total_amount: 3500, amount_paid: 0 },
  ];

  at("2026-11-03T02:00:00Z"); // Nov 3, 10 AM Manila: 2 days after the due date
  const noGrace = getAccountStanding(bills, 0);
  assert.equal(noGrace.status, "overdue");
  assert.equal(noGrace.inGrace, false);

  const withGrace = getAccountStanding(bills, 3);
  assert.equal(withGrace.status, "pending", "still inside the 3-day grace period");
  assert.equal(withGrace.inGrace, true);
  assert.equal(withGrace.daysUntilDue, -2);

  at("2026-11-04T16:00:00Z"); // Nov 5, 00:00 Manila: grace is over
  const after = getAccountStanding(bills, 3);
  assert.equal(after.status, "overdue");
  assert.equal(after.inGrace, false);
});

test("a bill that isn't late is never 'in grace'", async () => {
  await register();
  at("2026-11-01T02:00:00Z");

  const standing = getAccountStanding(
    [{ status: "unpaid", due_date: "2026-11-05", total_amount: 3500, amount_paid: 0 }],
    3
  );
  assert.equal(standing.inGrace, false);
});
