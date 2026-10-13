const rows: {
  key: "available" | "full" | "maintenance" | "inactive";
  label: string;
  dotClass: string;
}[] = [
  { key: "full", label: "Occupied", dotClass: "bg-status-unpaid" },
  { key: "available", label: "Available", dotClass: "bg-status-paid" },
  { key: "maintenance", label: "Maintenance", dotClass: "bg-status-partial" },
  { key: "inactive", label: "Inactive", dotClass: "bg-foreground-muted" },
];

export function RoomOccupancyMeter({
  counts,
  occupiedBeds,
  totalCapacity,
}: {
  counts: {
    available: number;
    full: number;
    maintenance: number;
    inactive: number;
  };
  occupiedBeds: number;
  totalCapacity: number;
}) {
  const safeCapacity = Math.max(0, totalCapacity);
  const safeOccupied = Math.max(0, Math.min(occupiedBeds, safeCapacity));

  const availableBeds = safeCapacity - safeOccupied;

  const pct =
    safeCapacity > 0 ? Math.round((safeOccupied / safeCapacity) * 100) : 0;

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="font-heading text-3xl font-semibold text-primary">
          {pct}%
        </span>
        <span className="text-xs text-foreground-muted">bed occupancy</span>
      </div>

      <div
        role="img"
        aria-label={`${pct}% bed occupancy: ${safeOccupied} of ${safeCapacity} usable bed spaces occupied`}
        className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mb-4 flex items-center justify-between text-xs">
        <span className="text-foreground-muted">Occupied bed spaces</span>
        <span className="font-mono font-medium text-foreground">
          {safeOccupied}/{safeCapacity}
        </span>
      </div>

      <div className="mb-4 flex items-center justify-between text-xs">
        <span className="text-foreground-muted">Available bed spaces</span>
        <span className="font-mono font-medium text-foreground">
          {availableBeds}
        </span>
      </div>

      <div className="space-y-2">
        {rows
          .filter((r) => r.key !== "inactive" || counts.inactive > 0)
          .map((r) => (
            <div
              key={r.key}
              className="flex items-center justify-between text-xs"
            >
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
