import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { TenantDetailContent } from "@/components/tenant-detail-content";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionUser();

  if (!session) redirect("/");
  if (session.profile?.role !== "owner") redirect("/tenant");

  const dormId = session.profile?.dorm_id;
  if (!dormId) redirect("/");

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/tenants"
        className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
        aria-label="Back to tenants"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>

      <TenantDetailContent id={id} dormId={dormId} />
    </div>
  );
}
