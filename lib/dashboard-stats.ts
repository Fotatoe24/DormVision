// The owner dashboard's 6-month income/expense trend, as a pure function.
//
// It lives here (moved out of app/admin/page.tsx unchanged) for two reasons:
// it can be tested on its own, and -- more to the point -- the page can now
// fetch ONLY the rows this function can use. The trend looks at six calendar
// months and nothing else, so loading a dorm's entire payment and transaction
// history on every dashboard visit grew without bound for no benefit.
// tests/dashboard-stats.test.ts checks that bounding the input like that gives
// exactly the same answer as passing everything.

export type TrendPayment = { amount: number | string; paid_at: string };

export type TrendTransaction = {
  type: string;
  category: string;
  amount: number | string;
  occurred_at: string;
};

// First day (00:00) of the oldest month shown: five months before the current
// one. Nothing earlier is ever read, so the page asks the database for nothing
// earlier.
export function trendWindowStart(now: Date) {
  return new Date(now.getFullYear(), now.getMonth() - 5, 1);
}

export function buildMonthlyTrend(
  payments: TrendPayment[],
  transactions: TrendTransaction[],
  now: Date
) {
  const months = Array.from({ length: 6 }, (_, i) => {
    const offset = 5 - i;
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    return {
      start,
      end,
      label: start.toLocaleDateString("en-PH", {
        month: "short",
        year: "2-digit",
      }),
    };
  });

  // Income = confirmed rent payments + manually logged income, EXCLUDING any
  // transaction in the 'rent' category: rent is already fully captured through
  // payments/bills, so counting a manual 'rent' entry too would double it.
  return months.map(({ start, end, label }) => {
    const income =
      payments
        .filter((p) => {
          const d = new Date(p.paid_at);
          return d >= start && d < end;
        })
        .reduce((sum, p) => sum + Number(p.amount), 0) +
      transactions
        .filter((t) => {
          if (t.type !== "income" || t.category === "rent") return false;
          const d = new Date(t.occurred_at + "T00:00:00");
          return d >= start && d < end;
        })
        .reduce((sum, t) => sum + Number(t.amount), 0);

    const expenses = transactions
      .filter((t) => {
        if (t.type !== "expense") return false;
        const d = new Date(t.occurred_at + "T00:00:00");
        return d >= start && d < end;
      })
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return { label, income, expenses };
  });
}
