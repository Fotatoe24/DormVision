// Category breakdown of this period's expenses, as a donut + legend.
// Unlike the line chart (income-expense-chart.tsx) or the occupancy
// meter (room-occupancy-meter.tsx), a donut genuinely fits here: this
// specific design was requested with a reference image showing one,
// and a 3-5 category expense split is a reasonable case for it —
// still kept restrained (fixed categorical colors, a legend with
// percentages doing the labeling, no inline value-per-slice clutter).
//
// accent and status-partial are both amber/gold in this app's palette
// and read as near-identical on an adjacent donut wedge (unlike a line
// chart, where position + the legend carry identity too) -- picked
// four tokens that are actually distinguishable from each other here:
// a red, a gold, a dark green, and a neutral tan-gray.
const CATEGORY_COLORS: Record<string, string> = {
  utilities: "var(--color-status-overdue)",
  repairs: "var(--color-accent)",
  supplies: "var(--color-status-unpaid)",
  other_expense: "var(--color-foreground-muted)",
};

export function ExpenseBreakdownDonut({
  data,
}: {
  data: { category: string; label: string; amount: number }[];
}) {
  const total = data.reduce((sum, d) => sum + d.amount, 0);

  if (total <= 0) {
    return (
      <p className="py-8 text-center text-sm text-foreground-muted">
        No expenses in this period yet.
      </p>
    );
  }

  const size = 140;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const segments = data
    .filter((d) => d.amount > 0)
    .reduce<{ rows: (typeof data[number] & { fraction: number; dashArray: string; dashOffset: number })[]; offset: number }>(
      (acc, d) => {
        const fraction = d.amount / total;
        const dash = fraction * circumference;
        // -2 keeps a 2px surface-colored gap between adjacent segments
        // (the app's existing stacked-segment convention) instead of a
        // drawn border.
        acc.rows.push({
          ...d,
          fraction,
          dashArray: `${Math.max(dash - 2, 0)} ${circumference}`,
          dashOffset: -acc.offset,
        });
        acc.offset += dash;
        return acc;
      },
      { rows: [], offset: 0 }
    ).rows;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Expense breakdown by category"
        className="shrink-0 -rotate-90"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-surface-muted)"
          strokeWidth={strokeWidth}
        />
        {segments.map((s) => (
          <circle
            key={s.category}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={CATEGORY_COLORS[s.category] ?? "var(--color-foreground-muted)"}
            strokeWidth={strokeWidth}
            strokeDasharray={s.dashArray}
            strokeDashoffset={s.dashOffset}
            strokeLinecap="butt"
          >
            <title>{`${s.label}: ${Math.round(s.fraction * 100)}%`}</title>
          </circle>
        ))}
      </svg>

      <div className="w-full space-y-2 sm:w-auto sm:min-w-[160px]">
        {segments.map((s) => (
          <div key={s.category} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-foreground-muted">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[s.category] ?? "var(--color-foreground-muted)" }}
              />
              {s.label}
            </span>
            <span className="font-mono font-medium text-foreground">
              {Math.round(s.fraction * 100)}%
            </span>
          </div>
        ))}
      </div>

      {/* Table view for screen readers / no-JS */}
      <table className="sr-only">
        <caption>Expense breakdown by category</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s) => (
            <tr key={s.category}>
              <th scope="row">{s.label}</th>
              <td>{Math.round(s.fraction * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
