import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { TenantShell } from "@/components/tenant-shell";
import { getDormName } from "@/lib/shell-data";

export default async function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role === "owner") redirect("/admin");

  const dormName = await getDormName(session.profile?.dorm_id);

  return <TenantShell dormName={dormName}>{children}</TenantShell>;
}
