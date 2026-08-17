// Lightweight inline-SVG line chart — no charting library in the stack
// (confirmed: package.json has none), and the app's existing convention
// for trend data (see app/admin/monitoring/page.tsx's BarRow) is a
// hand-rolled component rather than a dependency. A visually-hidden
// table carries the same data for screen readers / a no-JS table view.
function compactMoney(n: number) {
  if (n >= 1000) {
    const thousands = n / 1000;
    return `₱${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
  }
  return `₱${Math.round(n)}`;
}

function niceMax(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function IncomeExpenseChart({
  data,
}: {
  data: { label: string; income: number; expenses: number }[];
}) {
  const width = 600;
  const height = 220;
  const padding = { top: 16, right: 12, bottom: 24, left: 44 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxValue = niceMax(
    Math.max(1, ...data.map((d) => Math.max(d.income, d.expenses)))
  );

  const stepX = data.length > 1 ? chartWidth / (data.length - 1) : 0;

  function x(i: number) {
    return padding.left + i * stepX;
  }
  function y(value: number) {
    return padding.top + chartHeight - (value / maxValue) * chartHeight;
  }

  const incomePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.income)}`)
    .join(" ");
  const expensesPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.expenses)}`)
    .join(" ");

  const yTicks = [0, maxValue / 2, maxValue];
  const lastIndex = data.length - 1;

  return (
    <div>
      {/* Legend — always present for 2+ series */}
      <div className="mb-3 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-foreground-muted">
          <span className="h-2 w-2 rounded-full bg-status-paid" />
          Income
        </span>
        <span className="flex items-center gap-1.5 text-foreground-muted">
          <span className="h-2 w-2 rounded-full bg-status-overdue" />
          Expenses
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Income versus expenses for the last six months"
        className="w-full"
      >
        {/* Gridlines + y-axis labels */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={padding.left - 8}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-foreground-muted text-[9px]"
            >
              {compactMoney(tick)}
            </text>
          </g>
        ))}

        {/* X-axis month labels — end labels anchor inward so they don't
            clip past the chart edge */}
        {data.map((d, i) => (
          <text
            key={d.label}
            x={x(i)}
            y={height - 6}
            textAnchor={i === 0 ? "start" : i === lastIndex ? "end" : "middle"}
            className="fill-foreground-muted text-[9px]"
          >
            {d.label}
          </text>
        ))}

        {/* Expenses line (drawn first, so income sits on top at crossings) */}
        <path
          d={expensesPath}
          className="fill-none stroke-status-overdue"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Income line */}
        <path
          d={incomePath}
          className="fill-none stroke-status-paid"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Point markers */}
        {data.map((d, i) => (
          <g key={d.label}>
            <circle cx={x(i)} cy={y(d.expenses)} r={3} className="fill-status-overdue">
              <title>{`${d.label} expenses: ${compactMoney(d.expenses)}`}</title>
            </circle>
            <circle cx={x(i)} cy={y(d.income)} r={3} className="fill-status-paid">
              <title>{`${d.label} income: ${compactMoney(d.income)}`}</title>
            </circle>
          </g>
        ))}

        {/* End-of-line markers, ringed, with a direct value label */}
        {data.length > 0 && (
          <>
            <circle cx={x(lastIndex)} cy={y(data[lastIndex].expenses)} r={6} className="fill-surface" />
            <circle cx={x(lastIndex)} cy={y(data[lastIndex].expenses)} r={4} className="fill-status-overdue" />
            <text
              x={x(lastIndex) - 8}
              y={y(data[lastIndex].expenses) - 8}
              textAnchor="end"
              className="fill-status-overdue text-[10px] font-medium"
            >
              {compactMoney(data[lastIndex].expenses)}
            </text>

            <circle cx={x(lastIndex)} cy={y(data[lastIndex].income)} r={6} className="fill-surface" />
            <circle cx={x(lastIndex)} cy={y(data[lastIndex].income)} r={4} className="fill-status-paid" />
            <text
              x={x(lastIndex) - 8}
              y={y(data[lastIndex].income) - 8}
              textAnchor="end"
              className="fill-status-paid text-[10px] font-medium"
            >
              {compactMoney(data[lastIndex].income)}
            </text>
          </>
        )}
      </svg>

      {/* Table view for screen readers / no-JS */}
      <table className="sr-only">
        <caption>Income versus expenses, last six months</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Income</th>
            <th scope="col">Expenses</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{compactMoney(d.income)}</td>
              <td>{compactMoney(d.expenses)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
