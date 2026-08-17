import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createRoom,
  updateRoomStatus,
  deleteRoom,
  assignTenantToRoom,
  removeTenantFromRoom,
} from "@/lib/actions";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";
const labelClass = "mb-1.5 block text-xs font-medium text-foreground-muted";

const statusStyles: Record<string, string> = {
  available: "bg-status-paid/15 text-status-paid",
  full: "bg-status-unpaid/15 text-status-unpaid",
  maintenance: "bg-status-partial/15 text-status-partial",
};

const statusLabels: Record<string, string> = {
  available: "Available",
  full: "Full",
  maintenance: "Under maintenance",
};

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role !== "owner") redirect("/tenant");

  const dormId = session.profile.dorm_id;
  const supabase = createAdminClient();

  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("id, room_number, capacity, monthly_rate, status")
    .eq("dorm_id", dormId)
    .order("room_number");

  // Dual-read tenant occupancy from `tenants` (the source of truth for
  // move-in/move-out state) instead of `users`. `tenants` has no email
  // column, so pull email from `users` via a profile_id -> id join map.
  const { data: tenantRecords, error: tenantRecordsError } = await supabase
    .from("tenants")
    .select("id, profile_id, full_name, room_id, status")
    .eq("dorm_id", dormId)
    .eq("status", "active")
    .order("full_name");

  const profileIds = (tenantRecords ?? [])
    .map((t) => t.profile_id)
    .filter((id): id is string => Boolean(id));

  const { data: tenantUsers, error: tenantUsersError } = profileIds.length
    ? await supabase.from("users").select("id, email").in("id", profileIds)
    : { data: [] as { id: string; email: string }[], error: null };

  const loadError =
    roomsError?.message ||
    tenantRecordsError?.message ||
    tenantUsersError?.message ||
    null;

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-lg border border-status-overdue/30 bg-status-overdue/10 px-4 py-3 text-sm text-status-overdue">
          Could not load rooms: {loadError}
        </div>
      </div>
    );
  }

  const emailByProfileId = new Map(
    (tenantUsers ?? []).map((u) => [u.id, u.email])
  );

  // Downstream code keys tenants by `id` and passes that id as `tenantId`
  // to assignTenantToRoom/removeTenantFromRoom, which expect users.id
  // (== tenants.profile_id) — so `id` here stays profile_id, not the
  // tenants table's own row id.
  const tenants = (tenantRecords ?? []).map((t) => ({
    id: t.profile_id as string,
    full_name: t.full_name,
    email: emailByProfileId.get(t.profile_id as string) ?? "",
    room_id: t.room_id,
  }));

  const tenantsByRoom = new Map<string, typeof tenants>();
  const unassigned: typeof tenants = [];
  for (const t of tenants) {
    if (t.room_id) {
      const list = tenantsByRoom.get(t.room_id) ?? [];
      list.push(t);
      tenantsByRoom.set(t.room_id, list);
    } else {
      unassigned.push(t);
    }
  }

  const roomsWithSpace = (rooms ?? []).filter((r) => {
    const occ = tenantsByRoom.get(r.id)?.length ?? 0;
    return occ < r.capacity;
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs text-foreground-muted">Owner dashboard</p>
        <h1 className="font-heading text-lg font-semibold text-primary">
          Rooms
        </h1>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-status-overdue/30 bg-status-overdue/10 px-3 py-2 text-xs text-status-overdue">
          {error}
        </div>
      )}

      {/* Add room */}
      <form
        action={createRoom}
        className="mb-6 rounded-lg border border-border bg-surface p-6"
      >
        <p className="mb-4 font-heading text-sm font-semibold">Add a room</p>
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="roomNumber" className={labelClass}>
              Room number
            </label>
            <input
              id="roomNumber"
              name="roomNumber"
              type="text"
              required
              placeholder="204"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="capacity" className={labelClass}>
              Capacity
            </label>
            <input
              id="capacity"
              name="capacity"
              type="number"
              min={1}
              required
              placeholder="2"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="monthlyRate" className={labelClass}>
              Monthly rate
            </label>
            <input
              id="monthlyRate"
              name="monthlyRate"
              type="number"
              min={0}
              step="0.01"
              placeholder="3500"
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
        >
          Add room
        </button>
      </form>

      {/* Rooms grid */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(rooms ?? []).length === 0 && (
          <p className="col-span-full rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-foreground-muted">
            No rooms yet — add your first one above.
          </p>
        )}

        {(rooms ?? []).map((room) => {
          const occupants = tenantsByRoom.get(room.id) ?? [];
          return (
            <div
              key={room.id}
              className="flex flex-col rounded-lg border border-border bg-surface p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="font-heading text-sm font-semibold">
                  Room {room.room_number}
                </p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    statusStyles[room.status]
                  }`}
                >
                  {statusLabels[room.status] ?? room.status}
                </span>
              </div>

              <div className="mb-3 flex items-center justify-between text-xs text-foreground-muted">
                <span className="font-mono">
                  {occupants.length}/{room.capacity} occupied
                </span>
                <span className="font-mono text-accent">
                  ₱{Number(room.monthly_rate).toLocaleString()}/mo
                </span>
              </div>

              {occupants.length > 0 ? (
                <div className="mb-3 space-y-1.5">
                  {occupants.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between rounded-md bg-surface-muted px-3 py-1.5"
                    >
                      <span className="text-xs">{t.full_name}</span>
                      <form action={removeTenantFromRoom}>
                        <input type="hidden" name="tenantId" value={t.id} />
                        <input type="hidden" name="roomId" value={room.id} />
                        <button
                          type="submit"
                          className="text-xs text-foreground-muted hover:text-status-overdue"
                        >
                          Remove
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mb-3 text-xs text-foreground-muted">
                  No tenants assigned yet.
                </p>
              )}

              <div className="mt-auto flex items-center gap-2 pt-1">
                <form action={updateRoomStatus}>
                  <input type="hidden" name="roomId" value={room.id} />
                  <input
                    type="hidden"
                    name="status"
                    value={
                      room.status === "maintenance"
                        ? "available"
                        : "maintenance"
                    }
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground-muted hover:text-foreground"
                  >
                    {room.status === "maintenance"
                      ? "Mark available"
                      : "Mark under maintenance"}
                  </button>
                </form>

                {occupants.length === 0 && (
                  <form action={deleteRoom}>
                    <input type="hidden" name="roomId" value={room.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-status-overdue/30 px-2.5 py-1 text-xs text-status-overdue hover:bg-status-overdue/10"
                    >
                      Delete room
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unassigned tenants */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-heading font-semibold">
          Unassigned tenants
        </div>
        {unassigned.length > 0 ? (
          <div>
            {unassigned.map((t, i) => (
              <form
                action={assignTenantToRoom}
                key={t.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${
                  i < unassigned.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <input type="hidden" name="tenantId" value={t.id} />
                <div>
                  <p className="text-sm font-medium">{t.full_name}</p>
                  <p className="text-xs text-foreground-muted">{t.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    name="roomId"
                    required
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                  >
                    <option value="">Assign to room…</option>
                    {roomsWithSpace.map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.room_number}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-surface hover:opacity-90"
                  >
                    Assign
                  </button>
                </div>
              </form>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-foreground-muted">
            Every tenant has a room.
          </p>
        )}
      </div>
    </div>
  );
}
