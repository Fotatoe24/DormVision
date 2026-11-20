import type { LucideIcon } from "lucide-react";
import { compactMoney, niceMax } from "@/components/income-expense-chart";

// The Monitoring page's visuals. Inline SVG and design tokens only (no chart
// library, like the dashboard's charts), so they follow light/dark mode and the
// chosen color palette. Every chart carries a visually-hidden table with the same
// numbers, and nothing is conveyed by color alone: values are labelled, and
// legends spell the names out.

// ---------------------------------------------------------------------------
// KPI tile

type Tone = "default" | "good" | "warn" | "bad";

const toneText: Record<Tone, string> = {
  default: "text-foreground",
  good: "text-status-paid",
  warn: "text-status-partial",
  bad: "text-status-overdue",
};

const toneChip: Record<Tone, string> = {
  default: "bg-primary/10 text-primary",
  good: "bg-status-paid/15 text-status-paid",
  warn: "bg-status-partial/15 text-status-partial",
  bad: "bg-status-overdue/15 text-status-overdue",
};

const toneBar: Record<Tone, string> = {
  default: "bg-primary",
  good: "bg-status-paid",
  warn: "bg-status-partial",
  bad: "bg-status-overdue",
};

export function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
  progress,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  // 0..1: draws a slim progress bar under the figure.
  progress?: number;
}) {
  const pct = progress === undefined ? null : Math.round(Math.max(0, Math.min(1, progress)) * 100);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${toneChip[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs text-foreground-muted">{label}</p>
      </div>

      <p className={`font-mono text-2xl font-semibold ${toneText[tone]}`}>{value}</p>

      {pct !== null && (
        <div
          role="img"
          aria-label={`${label}: ${pct}%`}
          className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
        >
          <div className={`h-full rounded-full ${toneBar[tone]}`} style={{ width: `${pct}%` }} />
        </div>
      )}

      {sub && <p className="mt-2 text-xs text-foreground-muted">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared chart geometry. Drawn in a 360-unit-wide space on purpose (see
// income-expense-chart.tsx): the SVG scales to its card, and at 360 the 11px
// labels land close to their real size on a phone.

const W = 360;
const PAD = { top: 18, right: 12, left: 34 };

function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-foreground-muted">
          <span aria-hidden className={`h-2 w-2 rounded-sm ${item.className}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Occupancy: one column per month, a dashed line at total capacity.

export function OccupancyColumns({
  data,
  totalBeds,
}: {
  data: { label: string; occupied: number }[];
  totalBeds: number;
}) {
  const H = 190;
  const bottom = 26;
  const chartH = H - PAD.top - bottom;
  const chartW = W - PAD.left - PAD.right;

  const yMax = Math.max(totalBeds, ...data.map((d) => d.occupied), 1);
  const y = (v: number) => PAD.top + chartH - (v / yMax) * chartH;
  const slot = chartW / Math.max(data.length, 1);
  const barW = Math.min(slot * 0.56, 38);
  const lastIndex = data.length - 1;
  const ticks = yMax >= 4 ? [0, Math.round(yMax / 2), yMax] : [0, yMax];

  return (
    <div>
      <Legend
        items={[
          { label: "Occupied beds", className: "bg-primary" },
          { label: "Capacity", className: "border border-dashed border-foreground-muted bg-transparent" },
        ]}
      />

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Occupied beds per month for the last six months" className="w-full">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" className="fill-foreground-muted text-[11px]">
              {tick}
            </text>
          </g>
        ))}

        {/* Capacity */}
        {totalBeds > 0 && (
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(totalBeds)}
            y2={y(totalBeds)}
            className="stroke-foreground-muted"
            strokeWidth={1.25}
            strokeDasharray="4 3"
          />
        )}

        {data.map((d, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          const top = y(d.occupied);
          const height = Math.max(PAD.top + chartH - top, 0);
          const isLast = i === lastIndex;

          return (
            <g key={d.label}>
              {height > 0 && (
                <rect
                  x={cx - barW / 2}
                  y={top}
                  width={barW}
                  height={height}
                  rx={3}
                  className="fill-primary"
                  opacity={isLast ? 1 : 0.5}
                >
                  <title>{`${d.label}: ${d.occupied} of ${totalBeds} beds occupied`}</title>
                </rect>
              )}
              <text
                x={cx}
                y={(height > 0 ? top : PAD.top + chartH) - 5}
                textAnchor="middle"
                className={`text-[11px] ${isLast ? "fill-foreground font-semibold" : "fill-foreground-muted"}`}
              >
                {d.occupied}
              </text>
              <text x={cx} y={H - 7} textAnchor="middle" className="fill-foreground-muted text-[11px]">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      <table className="sr-only">
        <caption>Occupied beds per month, out of {totalBeds}</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Occupied beds</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{d.occupied}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billed vs collected: grouped columns, with each month's collection rate
// underneath.

export function BilledCollectedColumns({
  data,
}: {
  data: { label: string; billed: number; collected: number }[];
}) {
  const H = 214;
  const bottom = 46; // month label + collection-rate row
  const chartH = H - PAD.top - bottom;
  const left = 46;
  const chartW = W - left - PAD.right;

  const yMax = niceMax(Math.max(1, ...data.map((d) => d.billed)));
  const y = (v: number) => PAD.top + chartH - (v / yMax) * chartH;
  const slot = chartW / Math.max(data.length, 1);
  const barW = Math.min(slot * 0.3, 20);
  const lastIndex = data.length - 1;
  const ticks = [0, yMax / 2, yMax];

  return (
    <div>
      <Legend
        items={[
          { label: "Billed", className: "bg-accent" },
          { label: "Collected", className: "bg-status-paid" },
        ]}
      />

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Billed versus collected per month for the last six months" className="w-full">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} />
            <text x={left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" className="fill-foreground-muted text-[11px]">
              {compactMoney(tick)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = left + slot * i + slot / 2;
          const billedTop = y(d.billed);
          const collectedTop = y(d.collected);
          const base = PAD.top + chartH;
          const rate = d.billed > 0 ? Math.round((d.collected / d.billed) * 100) : null;
          const isLast = i === lastIndex;

          return (
            <g key={d.label}>
              {d.billed > 0 && (
                <rect x={cx - barW - 1} y={billedTop} width={barW} height={Math.max(base - billedTop, 0)} rx={3} className="fill-accent">
                  <title>{`${d.label} billed: ${compactMoney(d.billed)}`}</title>
                </rect>
              )}
              {d.collected > 0 && (
                <rect x={cx + 1} y={collectedTop} width={barW} height={Math.max(base - collectedTop, 0)} rx={3} className="fill-status-paid">
                  <title>{`${d.label} collected: ${compactMoney(d.collected)}`}</title>
                </rect>
              )}

              {/* Direct labels on the latest month only, so the rest stay calm */}
              {isLast && d.billed > 0 && (
                <text x={cx - barW / 2 - 1} y={billedTop - 5} textAnchor="middle" className="fill-foreground text-[10px] font-semibold">
                  {compactMoney(d.billed)}
                </text>
              )}
              {isLast && d.collected > 0 && (
                <text x={cx + barW / 2 + 1} y={collectedTop - 5} textAnchor="middle" className="fill-status-paid text-[10px] font-semibold">
                  {compactMoney(d.collected)}
                </text>
              )}

              <text x={cx} y={H - 24} textAnchor="middle" className="fill-foreground-muted text-[11px]">
                {d.label}
              </text>
              <text
                x={cx}
                y={H - 8}
                textAnchor="middle"
                className={`text-[11px] font-medium ${
                  rate === null
                    ? "fill-foreground-muted"
                    : rate >= 90
                      ? "fill-status-paid"
                      : rate >= 60
                        ? "fill-status-partial"
                        : "fill-status-overdue"
                }`}
              >
                {rate === null ? "–" : `${rate}%`}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-foreground-muted">
        The percentage under each month is how much of what was billed has been collected.
      </p>

      <table className="sr-only">
        <caption>Billed versus collected per month, with collection rate</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Billed</th>
            <th scope="col">Collected</th>
            <th scope="col">Collection rate</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{compactMoney(d.billed)}</td>
              <td>{compactMoney(d.collected)}</td>
              <td>{d.billed > 0 ? `${Math.round((d.collected / d.billed) * 100)}%` : "no bills"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status donut with the total in the middle and a legend that carries the
// counts, so no value depends on telling two colors apart.

export type DonutSegment = { label: string; value: number; color: string };

export function StatusDonut({
  segments,
  centerLabel,
  ariaLabel,
}: {
  segments: DonutSegment[];
  centerLabel: string;
  ariaLabel: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  const size = 132;
  const stroke = 20;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Each arc starts where the previous one ended (a 2-unit gap keeps neighbours
  // visually apart without drawing a border).
  const arcs = segments
    .filter((s) => s.value > 0)
    .reduce<{ rows: (DonutSegment & { dash: string; offset: number })[]; used: number }>(
      (acc, s) => {
        const length = (s.value / total) * circumference;
        acc.rows.push({
          ...s,
          dash: `${Math.max(length - 2, 0)} ${circumference}`,
          offset: -acc.used,
        });
        acc.used += length;
        return acc;
      },
      { rows: [], used: 0 }
    ).rows;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel} className="-rotate-90">
          <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--color-surface-muted)" strokeWidth={stroke} />
          {arcs.map((a) => (
            <circle
              key={a.label}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={a.color}
              strokeWidth={stroke}
              strokeDasharray={a.dash}
              strokeDashoffset={a.offset}
            >
              <title>{`${a.label}: ${a.value}`}</title>
            </circle>
          ))}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-2xl font-semibold text-foreground">{total}</span>
          <span className="text-[11px] text-foreground-muted">{centerLabel}</span>
        </div>
      </div>

      <ul className="w-full space-y-2 sm:flex-1">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
            <span className={`flex items-center gap-2 ${s.value === 0 ? "text-foreground-muted" : "text-foreground"}`}>
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
            <span className="font-mono text-xs text-foreground-muted">
              <span className="font-medium text-foreground">{s.value}</span>
              {total > 0 && ` · ${Math.round((s.value / total) * 100)}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
