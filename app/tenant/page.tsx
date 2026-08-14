import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateTenantProfile, logout } from "@/lib/actions";
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
      "full_name, email, phone, room_id, dorm_id, emergency_contact_name, emergency_contact_number"
    )
    .eq("id", session.user.id)
    .single();

  const { data: dorm } = me?.dorm_id
    ? await supabase
        .from("dormitories")
        .select("name")
        .eq("id", me.dorm_id)
        .maybeSingle()
    : { data: null };

  const { data: room } = me?.room_id
    ? await supabase
        .from("rooms")
        .select("room_number, monthly_rate")
        .eq("id", me.room_id)
        .single()
    : { data: null };

  const { data: roommates } = me?.room_id
    ? await supabase
        .from("users")
        .select("id, full_name")
        .eq("room_id", me.room_id)
        .neq("id", session.user.id)
    : { data: [] };

  return (
    <main className="flex-1 bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs text-foreground-muted">
              {dorm?.name ?? "Your dormitory"}
            </p>
            <h1 className="font-heading text-lg font-semibold text-primary">
              My DormVision
            </h1>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>

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

        {/* Profile */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-4 font-heading text-sm font-semibold">My profile</p>

          {saved && (
            <div className="mb-4 rounded-md border border-status-paid/30 bg-status-paid/10 px-3 py-2 text-xs text-status-paid">
              Profile updated.
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-md border border-status-overdue/30 bg-status-overdue/10 px-3 py-2 text-xs text-status-overdue">
              {error}
            </div>
          )}

          <form action={updateTenantProfile} className="space-y-4">
            <div>
              <p className={labelClass}>Name</p>
              <p className="text-sm">{me?.full_name}</p>
            </div>
            <div>
              <p className={labelClass}>Email</p>
              <p className="text-sm text-foreground-muted">{me?.email}</p>
            </div>
            <div>
              <label htmlFor="phone" className={labelClass}>
                Phone number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={me?.phone ?? ""}
                placeholder="09xx xxx xxxx"
                className={inputClass}
              />
            </div>
            <div className="border-t border-border pt-4">
              <label htmlFor="emergencyContactName" className={labelClass}>
                Emergency contact name
              </label>
              <input
                id="emergencyContactName"
                name="emergencyContactName"
                type="text"
                defaultValue={me?.emergency_contact_name ?? ""}
                placeholder="Maria Santos"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="emergencyContactNumber" className={labelClass}>
                Emergency contact number
              </label>
              <input
                id="emergencyContactNumber"
                name="emergencyContactNumber"
                type="tel"
                defaultValue={me?.emergency_contact_number ?? ""}
                placeholder="09xx xxx xxxx"
                className={inputClass}
              />
            </div>

            <SubmitButton
              pendingText="Saving…"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              Save profile
            </SubmitButton>
          </form>
        </div>
      </div>
    </main>
  );
}
