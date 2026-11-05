import { createAdminClient } from "@/lib/supabase/admin";
import { getMaintenanceSettings } from "@/lib/maintenance-settings";
import { getNotificationSettings } from "@/lib/notification-settings";

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

  // "New tenant notifications" toggle: when off, the owner gets no
  // pending-request badge in the nav.
  const { newTenantNotifications } = await getNotificationSettings(dormId);
  if (!newTenantNotifications) return 0;

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

  // "Maintenance notifications" toggle: when off, the owner gets no
  // pending-request badge in the nav.
  const { notifyOwner } = await getMaintenanceSettings(dormId);
  if (!notifyOwner) return 0;

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
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!tenant) return 0;

  const { count } = await supabase
    .from("maintenance_requests")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("status", "pending");

  return count ?? 0;
}

export async function getGraceDays(dormId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("dorm_settings")
    .select("grace_period_days")
    .eq("dorm_id", dormId)
    .maybeSingle();
  return data?.grace_period_days ?? 0;
}

// Grace days for several dorms at once (a tenant's history can span dorms).
// A dorm with no settings row, or any lookup problem, counts as 0 -- the same
// default as before the setting was wired up.
export async function getGraceDaysByDorm(dormIds: string[]) {
  const graceByDorm = new Map<string, number>();
  if (dormIds.length === 0) return graceByDorm;

  const { data } = await createAdminClient()
    .from("dorm_settings")
    .select("dorm_id, grace_period_days")
    .in("dorm_id", dormIds);

  for (const row of data ?? []) {
    graceByDorm.set(row.dorm_id, row.grace_period_days ?? 0);
  }
  return graceByDorm;
}

// The signed-in user's display photo and avatar color, for the account row in
// the sidebar. Loaded separately from the session (the login token doesn't
// carry it) and never throws: no photo simply means initials are shown.
export async function getUserAvatar(userId: string | null | undefined) {
  const none = { avatarUrl: null as string | null, avatarColor: null as string | null };
  if (!userId) return none;

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("users")
      .select("avatar_url, avatar_color")
      .eq("id", userId)
      .maybeSingle();

    return {
      avatarUrl: (data?.avatar_url as string | null) ?? null,
      avatarColor: (data?.avatar_color as string | null) ?? null,
    };
  } catch {
    return none;
  }
}
