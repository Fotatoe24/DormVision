import { formatBillDate } from "@/lib/billing";

type Room = {
  room_number: string;
  monthly_rate: number | string;
} | null;

export function AccommodationCard({
  dormName,
  room,
  roommates,
  moveInDate,
}: {
  dormName?: string | null;
  room: Room;
  roommates: { id: string; full_name: string }[];
  moveInDate?: string | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <p className="mb-3 font-heading text-sm font-semibold">My accommodation</p>

      {!room ? (
        <p className="text-sm text-foreground-muted">
          You haven&apos;t been assigned a room yet. Check with your dorm
          owner.
        </p>
      ) : (
        <>
          <p className="text-xs text-foreground-muted">{dormName ?? "Your dormitory"}</p>
          <p className="mb-3 text-sm font-medium text-foreground">
            Room <span className="font-mono">{room.room_number}</span>
          </p>

          <div className="mb-3 flex items-center justify-between text-xs">
            <span className="text-foreground-muted">Monthly rent</span>
            <span className="font-mono font-medium text-accent">
              ₱{Number(room.monthly_rate).toLocaleString()}
            </span>
          </div>

          {moveInDate && (
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="text-foreground-muted">Move-in date</span>
              <span className="text-foreground">{formatBillDate(moveInDate)}</span>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs text-foreground-muted">Roommates</p>
            {roommates.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {roommates.map((r) => (
                  <span
                    key={r.id}
                    className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs"
                  >
                    {r.full_name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-foreground-muted">
                You currently have no roommates.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
