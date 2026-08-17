import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminShell } from "@/components/admin-shell";

export default async function AdminLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role !== "owner") redirect("/tenant");

  const supabase = createAdminClient();

  const [{ data: dorm }, { count: pendingRequestsCount }] = await Promise.all(
    [
      session.profile.dorm_id
        ? supabase
            .from("dormitories")
            .select("name")
            .eq("id", session.profile.dorm_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      session.profile.dorm_id
        ? supabase
            .from("tenant_registration_requests")
            .select("id", { count: "exact", head: true })
            .eq("dorm_id", session.profile.dorm_id)
            .eq("status", "pending")
        : Promise.resolve({ count: 0 }),
    ]
  );

  return (
    <AdminShell
      dormName={dorm?.name}
      ownerName={session.profile.full_name}
      pendingRequestsCount={pendingRequestsCount ?? 0}
    >
      {children}
      {modal}
    </AdminShell>
  );
}
