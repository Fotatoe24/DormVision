import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { TenantShell } from "@/components/tenant-shell";
import { AppearanceSync } from "@/components/appearance-sync";
import { getSavedAppearance } from "@/lib/appearance";
import {
  getDormName,
  getMyPendingMaintenanceRequestsCount,
} from "@/lib/shell-data";

export default async function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role === "owner") redirect("/admin");

  const [dormName, pendingMaintenanceCount, appearance] = await Promise.all([
    getDormName(session.profile?.dorm_id),
    getMyPendingMaintenanceRequestsCount(session.user.id),
    getSavedAppearance(session.user.id),
  ]);

  return (
    <>
      <AppearanceSync userId={session.user.id} {...appearance} />
      <TenantShell
        dormName={dormName}
        tenantName={session.profile?.full_name}
        pendingMaintenanceCount={pendingMaintenanceCount}
      >
        {children}
      </TenantShell>
    </>
  );
}
