import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { TenantDetailContent } from "@/components/tenant-detail-content";

// The full-page tenant detail: what you get from a direct link, a bookmark, a
// refresh, or opening in a new tab. Clicking a tenant in the list while already
// inside the app shows the same content as a pop-up instead (the intercepting
// route at app/admin/@modal/(.)tenants/[id]), which only works when a real
// page exists at this URL to fall back to -- without this file, a refresh on a
// tenant's URL was a 404, and Next 16.4 refuses to build an intercepting route
// that has no page behind it.
export default async function TenantDetailPage({
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
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/tenants"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to tenants
      </Link>

      <div className="rounded-lg border border-border bg-background p-6">
        <TenantDetailContent
          id={id}
          dormId={dormId}
          error={error}
          saved={saved}
        />
      </div>
    </div>
  );
}
