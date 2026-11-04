import test from "node:test";
import assert from "node:assert/strict";
import { buildMonthlyTrend, periodDataStart, trendWindowStart } from "@/lib/dashboard-stats";
import { toDateString } from "@/lib/billing";

// Production runs in Manila time (instrumentation.ts); do the same here so the
// month boundaries below mean what they mean on the server.
process.env.TZ = "Asia/Manila";

const NOW = new Date("2026-11-03T04:00:00Z"); // Nov 3, 12:00 PM Manila

test("the window starts on the 1st, five months back", () => {
  assert.equal(toDateString(trendWindowStart(NOW)), "2026-06-01");
  assert.equal(toDateString(trendWindowStart(new Date("2026-01-15T00:00:00Z"))), "2025-08-01"); // crosses a year
  assert.equal(toDateString(trendWindowStart(new Date("2026-03-31T00:00:00Z"))), "2025-10-01");
});

test("six months, oldest first, labelled by month", () => {
  const trend = buildMonthlyTrend([], [], NOW);

  assert.equal(trend.length, 6);
  assert.deepEqual(trend.map((m) => m.label), ["Jun 26", "Jul 26", "Aug 26", "Sep 26", "Oct 26", "Nov 26"]);
  assert.ok(trend.every((m) => m.income === 0 && m.expenses === 0));
});

test("income = confirmed payments + manual income; expenses = expense transactions", () => {
  const trend = buildMonthlyTrend(
    [
      { amount: "3500.00", paid_at: "2026-10-05T03:00:00Z" },
      { amount: 3500, paid_at: "2026-10-20T03:00:00Z" },
      { amount: 1000, paid_at: "2026-11-02T03:00:00Z" },
    ],
    [
      { type: "income", category: "other_income", amount: 500, occurred_at: "2026-10-10" },
      { type: "expense", category: "utilities", amount: 1200, occurred_at: "2026-10-12" },
      { type: "expense", category: "repairs", amount: 300, occurred_at: "2026-11-01" },
    ],
    NOW
  );

  const oct = trend[4];
  const nov = trend[5];
  assert.deepEqual([oct.income, oct.expenses], [3500 + 3500 + 500, 1200]);
  assert.deepEqual([nov.income, nov.expenses], [1000, 300]);
});

test("a manual 'rent' income entry is NOT counted (rent already comes from payments)", () => {
  const trend = buildMonthlyTrend(
    [{ amount: 3500, paid_at: "2026-10-05T03:00:00Z" }],
    [{ type: "income", category: "rent", amount: 3500, occurred_at: "2026-10-05" }],
    NOW
  );

  assert.equal(trend[4].income, 3500); // not 7000
});

test("month boundaries are Manila's: midnight on the 1st starts the new month", () => {
  const trend = buildMonthlyTrend(
    [
      { amount: 1, paid_at: "2026-10-31T15:59:59Z" }, // 11:59:59 PM Oct 31, Manila
      { amount: 10, paid_at: "2026-10-31T16:00:00Z" }, // 12:00:00 AM Nov 1, Manila
    ],
    [],
    NOW
  );

  assert.equal(trend[4].income, 1); // October
  assert.equal(trend[5].income, 10); // November
});

test("rows older than the window are ignored", () => {
  const trend = buildMonthlyTrend(
    [{ amount: 999, paid_at: "2026-05-31T03:00:00Z" }],
    [{ type: "expense", category: "other_expense", amount: 999, occurred_at: "2026-05-31" }],
    NOW
  );

  assert.ok(trend.every((m) => m.income === 0 && m.expenses === 0));
});

// ---------------------------------------------------------------------------
// The reason this function was extracted: the dashboard now asks the database
// only for rows inside the window. That is only safe if it can never change the
// answer. Check it on thousands of randomized histories, at awkward "now"s
// (month ends, the 1st, year boundaries, 1 AM Manila).

function rng(seed: number) {
  // small deterministic PRNG so a failure is reproducible
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test("fetching only the 6-month window gives exactly the same dashboard as fetching everything", () => {
  const random = rng(20261103);
  const nowsToTry = [
    "2026-11-03T04:00:00Z",
    "2026-10-31T17:30:00Z", // 1:30 AM Nov 1 Manila
    "2026-01-01T00:00:00Z",
    "2026-12-31T15:59:59Z",
    "2026-03-31T10:00:00Z",
    "2026-07-15T08:00:00Z",
  ];

  for (const nowIso of nowsToTry) {
    const now = new Date(nowIso);

    for (let round = 0; round < 200; round++) {
      // ~3 years of history around "now"
      const instant = () => new Date(now.getTime() + (random() - 0.75) * 3 * 365 * 86_400_000);

      const payments = Array.from({ length: 60 }, () => ({
        amount: Math.round(random() * 5000) / 100,
        paid_at: instant().toISOString(),
      }));
      const transactions = Array.from({ length: 40 }, () => ({
        type: random() < 0.5 ? "income" : "expense",
        category: ["rent", "utilities", "repairs", "other_income", "other_expense"][Math.floor(random() * 5)],
        amount: Math.round(random() * 5000) / 100,
        occurred_at: toDateString(instant()),
      }));

      // exactly the filters the page sends to the database
      const start = trendWindowStart(now);
      const boundedPayments = payments.filter((p) => p.paid_at >= start.toISOString());
      const boundedTransactions = transactions.filter((t) => t.occurred_at >= toDateString(start));

      assert.deepEqual(
        buildMonthlyTrend(boundedPayments, boundedTransactions, now),
        buildMonthlyTrend(payments, transactions, now),
        `now=${nowIso} round=${round}`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Income & Expenses page: it may only fetch from periodDataStart(), so that
// date must be at or before the start of EVERY view the page offers.

test("the Income & Expenses window covers every view, in every month of several years", () => {
  for (let year = 2024; year <= 2027; year++) {
    for (let month = 0; month < 12; month++) {
      for (const day of [1, 15, 28]) {
        const now = new Date(year, month, day, 12);
        const start = periodDataStart(now).getTime();

        const viewStarts = {
          "this month": new Date(year, month, 1),
          "last month": new Date(year, month - 1, 1),
          "year to date": new Date(year, 0, 1),
          "trend (oldest of 6 months)": trendWindowStart(now),
        };

        for (const [name, viewStart] of Object.entries(viewStarts)) {
          assert.ok(start <= viewStart.getTime(), `${year}-${month + 1}-${day}: window starts after the ${name} view`);
        }
      }
    }
  }
});

test("in January the window reaches into the previous year; later in the year it is the trend's start", () => {
  assert.equal(toDateString(periodDataStart(new Date("2026-01-20T04:00:00Z"))), "2025-08-01"); // 6-month trend
  assert.equal(toDateString(periodDataStart(new Date("2026-07-10T04:00:00Z"))), "2026-01-01"); // year to date
  assert.equal(toDateString(periodDataStart(new Date("2026-03-10T04:00:00Z"))), "2025-10-01"); // trend still reaches back past Jan 1
});

test("the window is not wastefully wide: it starts exactly at the earliest view", () => {
  const now = new Date("2026-11-03T04:00:00Z");

  assert.equal(toDateString(periodDataStart(now)), "2026-01-01"); // YTD is the earliest in November
});
