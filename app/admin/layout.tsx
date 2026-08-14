import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role !== "owner") redirect("/tenant");

  const supabase = await createClient();

  const { data: dorm } = session.profile.dorm_id
    ? await supabase
        .from("dormitories")
        .select("name")
        .eq("id", session.profile.dorm_id)
        .maybeSingle()
    : { data: null };

  return (
    <AdminShell dormName={dorm?.name} ownerName={session.profile.full_name}>
      {children}
    </AdminShell>
  );
}
