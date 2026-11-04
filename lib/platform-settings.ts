import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type PlatformSettings = {
  requireOwnerApproval: boolean;
};

// Platform-wide switches (migration 0028; a single row). If the table isn't
// there yet, or can't be read, the defaults apply -- which are the behaviour
// before the feature existed: new owners are approved automatically.
export async function getPlatformSettings(admin: Admin): Promise<PlatformSettings> {
  const { data, error } = await admin
    .from("platform_settings")
    .select("require_owner_approval")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    if (error.code !== "PGRST205" && error.code !== "42P01") {
      console.error("Could not read platform settings:", error);
    }
    return { requireOwnerApproval: false };
  }

  return { requireOwnerApproval: data?.require_owner_approval === true };
}
