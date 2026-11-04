import type { createAdminClient } from "@/lib/supabase/admin";

// Everything the platform admin does -- and every admin sign-in -- is written to
// audit_log (migration 0028), which the database refuses to edit or delete.

type Admin = ReturnType<typeof createAdminClient>;

export type AuditEntry = {
  actor: { id: string | null; email: string };
  action: string; // 'dorm.suspend', 'account.disable', 'admin.sign_in', ...
  targetType?: "dormitory" | "user" | "platform_settings";
  targetId?: string | null;
  targetLabel?: string | null;
  reason?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
};

// Resolves to false (and logs) instead of throwing when the entry can't be
// written: an admin sign-in or action that has already happened must not be
// undone by a logging problem, but the failure is logged loudly.
export async function recordAudit(admin: Admin, entry: AuditEntry): Promise<boolean> {
  const { error } = await admin.from("audit_log").insert({
    actor_id: entry.actor.id,
    actor_email: entry.actor.email,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    target_label: entry.targetLabel ?? null,
    reason: entry.reason ?? null,
    details: entry.details ?? {},
    ip: entry.ip ?? null,
  });

  if (error) {
    // 42P01 / PGRST205: migration 0028 not run yet.
    if (error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("Could not write the audit log:", error);
    }
    return false;
  }

  return true;
}
