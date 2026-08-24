import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AdminShell } from "@/components/admin-shell";
import { TenantShell } from "@/components/tenant-shell";
import { getDormName, getPendingRequestsCount } from "@/lib/shell-data";

// /profile is shared by both roles but previously had no layout at
// all — no sidebar, no bottom nav, no way back except the browser's
// back button. This wraps it in the same role-appropriate shell as
// every other page, without changing the route itself (both AdminShell
// and TenantShell's account menus already link here, so moving this to
// a role-specific path would break those existing links for no reason).
export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();

  if (!session) redirect("/");

  const isOwner = session.profile?.role === "owner";

  if (isOwner) {
    const [dormName, pendingRequestsCount] = await Promise.all([
      getDormName(session.profile?.dorm_id),
      getPendingRequestsCount(session.profile?.dorm_id),
    ]);

    return (
      <AdminShell
        dormName={dormName}
        ownerName={session.profile?.full_name}
        pendingRequestsCount={pendingRequestsCount}
      >
        {children}
      </AdminShell>
    );
  }

  const dormName = await getDormName(session.profile?.dorm_id);

  return <TenantShell dormName={dormName}>{children}</TenantShell>;
}
