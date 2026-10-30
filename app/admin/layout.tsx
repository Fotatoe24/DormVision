import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AdminShell } from "@/components/admin-shell";
import { AppearanceSync } from "@/components/appearance-sync";
import { getSavedAppearance } from "@/lib/appearance";
import {
  getDormName,
  getPendingRequestsCount,
  getPendingMaintenanceRequestsCount,
} from "@/lib/shell-data";

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

  const [dormName, pendingRequestsCount, pendingMaintenanceCount, appearance] =
    await Promise.all([
      getDormName(session.profile.dorm_id),
      getPendingRequestsCount(session.profile.dorm_id),
      getPendingMaintenanceRequestsCount(session.profile.dorm_id),
      getSavedAppearance(session.user.id),
    ]);

  return (
    <>
      <AppearanceSync userId={session.user.id} {...appearance} />
      <AdminShell
        dormName={dormName}
        ownerName={session.profile.full_name}
        pendingRequestsCount={pendingRequestsCount}
        pendingMaintenanceCount={pendingMaintenanceCount}
      >
        {children}
        {modal}
      </AdminShell>
    </>
  );
}
