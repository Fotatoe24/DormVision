import { createAdminClient } from "@/lib/supabase/admin";

export type NotificationSettings = {
  paymentReminders: boolean;
  overdueNotifications: boolean;
  newTenantNotifications: boolean;
};

// The in-app notification toggles on the Settings page (maintenance has its
// own loader in lib/maintenance-settings.ts). These only control what the
// app itself shows — the tenant dashboard banner and the owner's nav badge —
// there is no email/SMS delivery behind them. A dorm with no dorm_settings
// row yet falls back to the same defaults the table itself uses.
export async function getNotificationSettings(
  dormId: string | null | undefined
): Promise<NotificationSettings> {
  const defaults: NotificationSettings = {
    paymentReminders: true,
    overdueNotifications: true,
    newTenantNotifications: true,
  };

  if (!dormId) return defaults;

  const admin = createAdminClient();
  const { data } = await admin
    .from("dorm_settings")
    .select(
      "enable_payment_reminders, enable_overdue_notifications, enable_new_tenant_notifications"
    )
    .eq("dorm_id", dormId)
    .maybeSingle();

  if (!data) return defaults;

  return {
    paymentReminders: data.enable_payment_reminders ?? defaults.paymentReminders,
    overdueNotifications:
      data.enable_overdue_notifications ?? defaults.overdueNotifications,
    newTenantNotifications:
      data.enable_new_tenant_notifications ?? defaults.newTenantNotifications,
  };
}
