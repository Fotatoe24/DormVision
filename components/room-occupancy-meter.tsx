// A meter (single ratio) + status legend, not a donut — for a 3-4
// category part-to-whole breakdown a meter plus a dot-legend (the same
// pattern already used for bill-status counts elsewhere in the app)
// reads more clearly than a pie/donut and stays consistent with the
// rest of DormVision's hand-rolled, non-decorative chart style.
const rows: { key: "available" | "full" | "maintenance" | "inactive"; label: string; dotClass: string }[] = [
  { key: "full", label: "Occupied", dotClass: "bg-status-unpaid" },
  { key: "available", label: "Available", dotClass: "bg-status-paid" },
  { key: "maintenance", label: "Maintenance", dotClass: "bg-status-partial" },
  { key: "inactive", label: "Inactive", dotClass: "bg-foreground-muted" },
];

export function RoomOccupancyMeter({
  counts,
  totalRooms,
}: {
  counts: { available: number; full: number; maintenance: number; inactive: number };
  totalRooms: number;
}) {
  const pct = totalRooms > 0 ? Math.round((counts.full / totalRooms) * 100) : 0;

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="font-heading text-3xl font-semibold text-primary">
          {pct}%
        </span>
        <span className="text-xs text-foreground-muted">occupied</span>
      </div>

      <div
        role="img"
        aria-label={`${pct}% of rooms occupied`}
        className="mb-4 h-2.5 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="space-y-2">
        {rows
          .filter((r) => r.key !== "inactive" || counts.inactive > 0)
          .map((r) => (
            <div key={r.key} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-foreground-muted">
                <span className={`h-2 w-2 rounded-full ${r.dotClass}`} />
                {r.label}
              </span>
              <span className="font-mono font-medium text-foreground">
                {counts[r.key]}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
