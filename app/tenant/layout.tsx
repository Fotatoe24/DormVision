import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TenantShell } from "@/components/tenant-shell";

export default async function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role === "owner") redirect("/admin");

  const supabase = createAdminClient();

  const { data: dorm } = session.profile?.dorm_id
    ? await supabase
        .from("dormitories")
        .select("name")
        .eq("id", session.profile.dorm_id)
        .maybeSingle()
    : { data: null };

  return <TenantShell dormName={dorm?.name}>{children}</TenantShell>;
}
