import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Gate for everything under /platform and every platform action. Checks the
// role in the session AND asks the database, so an admin account that has been
// disabled (or demoted) loses access immediately rather than at cookie expiry.
//
// Anyone who isn't the platform admin is sent to the normal front door; the
// platform area never reveals itself to them.
export async function requirePlatformAdmin() {
  const session = await getSessionUser();

  if (!session || session.profile?.role !== "platform_admin") redirect("/");

  const { data: account, error } = await createAdminClient()
    .from("users")
    .select("role, disabled_at")
    .eq("id", session.user.id)
    .maybeSingle();

  // 42703 / PGRST204: `disabled_at` doesn't exist yet (migration 0028 not run).
  // The role alone decides then; any other failure shuts the door.
  if (error && error.code !== "42703" && error.code !== "PGRST204") redirect("/");
  if (!error && (account?.role !== "platform_admin" || account.disabled_at)) redirect("/");

  return {
    id: session.user.id,
    email: session.user.email,
    fullName: session.profile.full_name,
    sid: session.sid,
  };
}
