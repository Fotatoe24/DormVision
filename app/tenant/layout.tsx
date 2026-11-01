import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { TenantShell } from "@/components/tenant-shell";
import { getCurrentTenancy } from "@/lib/tenant-status";
import { AppearanceSync } from "@/components/appearance-sync";
import { getSavedAppearance } from "@/lib/appearance";
import {
  getDormName,
  getMyPendingMaintenanceRequestsCount,
  getUserAvatar,
} from "@/lib/shell-data";

export default async function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role === "owner") redirect("/admin");

  // The dorm shown in the shell is the one of their live tenancy; the
  // session's dorm is only the fallback for someone who isn't a tenant yet
  // (it can lag behind when an owner reactivates them, or after a move).
  const tenancy = await getCurrentTenancy(session.user.id);
  const shellDormId =
    tenancy && tenancy.status !== "moved_out"
      ? tenancy.dorm_id
      : session.profile?.dorm_id;

  const [dormName, pendingMaintenanceCount, appearance, avatar] =
    await Promise.all([
    getDormName(shellDormId),
    getMyPendingMaintenanceRequestsCount(session.user.id),
    getSavedAppearance(session.user.id),
    getUserAvatar(session.user.id),
  ]);

  return (
    <>
      <AppearanceSync userId={session.user.id} {...appearance} />
      <TenantShell
        dormName={dormName}
        tenantName={session.profile?.full_name}
        avatarUrl={avatar.avatarUrl}
        avatarColor={avatar.avatarColor}
        pendingMaintenanceCount={pendingMaintenanceCount}
      >
        {children}
      </TenantShell>
    </>
  );
}
