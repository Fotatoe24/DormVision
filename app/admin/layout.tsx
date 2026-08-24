import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AdminShell } from "@/components/admin-shell";
import { getDormName, getPendingRequestsCount } from "@/lib/shell-data";

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

  const [dormName, pendingRequestsCount] = await Promise.all([
    getDormName(session.profile.dorm_id),
    getPendingRequestsCount(session.profile.dorm_id),
  ]);

  return (
    <AdminShell
      dormName={dormName}
      ownerName={session.profile.full_name}
      pendingRequestsCount={pendingRequestsCount}
    >
      {children}
      {modal}
    </AdminShell>
  );
}
