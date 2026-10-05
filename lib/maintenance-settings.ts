import { createAdminClient } from "@/lib/supabase/admin";

export type MaintenanceSettings = {
  allowRequests: boolean;
  requireApproval: boolean;
  notifyOwner: boolean;
};

// Single source of truth for the three maintenance toggles on the
// Settings page. A dorm with no dorm_settings row yet falls back to the
// same defaults the table itself uses.
export async function getMaintenanceSettings(
  dormId: string | null | undefined
): Promise<MaintenanceSettings> {
  const defaults: MaintenanceSettings = {
    allowRequests: true,
    requireApproval: false,
    notifyOwner: true,
  };

  if (!dormId) return defaults;

  const admin = createAdminClient();
  const { data } = await admin
    .from("dorm_settings")
    .select(
      "allow_maintenance_requests, require_maintenance_approval, enable_maintenance_notifications"
    )
    .eq("dorm_id", dormId)
    .maybeSingle();

  if (!data) return defaults;

  return {
    allowRequests: data.allow_maintenance_requests ?? defaults.allowRequests,
    requireApproval:
      data.require_maintenance_approval ?? defaults.requireApproval,
    notifyOwner: data.enable_maintenance_notifications ?? defaults.notifyOwner,
  };
}
