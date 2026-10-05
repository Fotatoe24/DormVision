import { createAdminClient } from "@/lib/supabase/admin";

// Shared by every layout that wraps a page in AdminShell/TenantShell
// (app/admin/layout.tsx, app/tenant/layout.tsx, app/profile/layout.tsx)
// so the same "look up this dorm's name" query isn't hand-copied a
// third time.
export async function getDormName(dormId: string | null | undefined) {
  if (!dormId) return undefined;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("dormitories")
    .select("name")
    .eq("id", dormId)
    .maybeSingle();

  return data?.name ?? undefined;
}

export async function getPendingRequestsCount(
  dormId: string | null | undefined
) {
  if (!dormId) return 0;

  const supabase = createAdminClient();
  const { count } = await supabase
    .from("tenant_registration_requests")
    .select("id", { count: "exact", head: true })
    .eq("dorm_id", dormId)
    .eq("status", "pending");

  return count ?? 0;
}

export async function getPendingMaintenanceRequestsCount(
  dormId: string | null | undefined
) {
  if (!dormId) return 0;

  const supabase = createAdminClient();
  const { count } = await supabase
    .from("maintenance_requests")
    .select("id", { count: "exact", head: true })
    .eq("dorm_id", dormId)
    .eq("status", "pending");

  return count ?? 0;
}

export async function getMyPendingMaintenanceRequestsCount(
  userId: string | null | undefined
) {
  if (!userId) return 0;

  const supabase = createAdminClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();

  if (!tenant) return 0;

  const { count } = await supabase
    .from("maintenance_requests")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("status", "pending");

  return count ?? 0;
}
