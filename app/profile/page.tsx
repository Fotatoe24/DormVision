import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProfileView } from "@/components/profile-view";

export default async function ProfilePage() {
  const session = await getSessionUser();
  if (!session) redirect("/");

  const supabase = await createClient();

  const { data: me } = await supabase
    .from("users")
    .select(
      "full_name, email, role, avatar_url, avatar_color, created_at, dorm_id"
    )
    .eq("id", session.user.id)
    .single();

  if (!me) redirect("/");

  const { data: dorm } = me.dorm_id
    ? await supabase
        .from("dormitories")
        .select("name")
        .eq("id", me.dorm_id)
        .maybeSingle()
    : { data: null };

  // Contact details live on `tenants`, not `users` — owners don't have a
  // tenants row at all, so only fetch this for tenants.
  const { data: tenantRecord } =
    me.role === "tenant"
      ? await supabase
          .from("tenants")
          .select(
            "contact_number, emergency_contact_name, emergency_contact_number"
          )
          .eq("profile_id", session.user.id)
          .maybeSingle()
      : { data: null };

  return (
    <ProfileView
      user={{
        id: session.user.id,
        fullName: me.full_name,
        email: me.email,
        role: me.role,
        avatarColor: me.avatar_color ?? "#1f4d3d",
        avatarUrl: me.avatar_url,
        createdAt: me.created_at,
        dormName: dorm?.name,
        phone: tenantRecord?.contact_number ?? null,
        emergencyContactName: tenantRecord?.emergency_contact_name ?? null,
        emergencyContactNumber: tenantRecord?.emergency_contact_number ?? null,
      }}
    />
  );
}
