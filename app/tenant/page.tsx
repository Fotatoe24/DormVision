import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateTenantProfile } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";
const labelClass = "mb-1.5 block text-xs font-medium text-foreground-muted";

export default async function TenantPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role === "owner") redirect("/admin");

  const supabase = await createClient();

  const { data: me } = await supabase
    .from("users")
    .select(
      "full_name, email, phone, emergency_contact_name, emergency_contact_number"
    )
    .eq("id", session.user.id)
    .single();

  // Room assignment now lives on `tenants`, not `users.room_id` — that's
  // the field assignTenantToRoom/removeTenantFromRoom keep in sync.
  const { data: myTenantRecord } = await supabase
    .from("tenants")
    .select("room_id")
    .eq("profile_id", session.user.id)
    .single();

  const roomId = myTenantRecord?.room_id ?? null;

  const { data: room } = roomId
    ? await supabase
        .from("rooms")
        .select("room_number, monthly_rate")
        .eq("id", roomId)
        .single()
    : { data: null };

  // Roommates: other active tenants sharing the same room. `tenants` has
  // its own full_name column, so no join back to `users` is needed here.
  const { data: roommates } = roomId
    ? await supabase
        .from("tenants")
        .select("id, full_name")
        .eq("room_id", roomId)
        .eq("status", "active")
        .neq("profile_id", session.user.id)
    : { data: [] };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Room info */}
      <div className="mb-6 rounded-lg border border-border bg-surface p-6">
        <p className="mb-3 font-heading text-sm font-semibold">My room</p>
        {room ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm">
                Room <span className="font-mono">{room.room_number}</span>
              </p>
              <span className="font-mono text-sm text-accent">
                ₱{Number(room.monthly_rate).toLocaleString()}/mo
              </span>
            </div>
            {roommates && roommates.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs text-foreground-muted">
                  Roommates
                </p>
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
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-foreground-muted">
            You haven&apos;t been assigned a room yet. Check with your dorm
            owner.
          </p>
        )}
      </div>
    </div>
  );
}
