import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { Dialog } from "@/components/dialog";
import { TenantDetailContent } from "@/components/tenant-detail-content";

// Intercepts client-side navigation from /admin/tenants to
// /admin/tenants/[id] and renders it as a modal instead of a full page
// (Next.js parallel + intercepting routes — the "(.)" matches the same
// level as this @modal slot, i.e. app/admin/). A direct link or a
// refresh on /admin/tenants/[id] bypasses this entirely and renders the
// real page at app/admin/tenants/[id]/page.tsx instead.
export default async function TenantDetailModal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role !== "owner") redirect("/tenant");

  const dormId = session.profile?.dorm_id;
  if (!dormId) redirect("/");

  return (
    <Dialog ariaLabel="Tenant details">
      <TenantDetailContent id={id} dormId={dormId} error={error} saved={saved} />
    </Dialog>
  );
}
