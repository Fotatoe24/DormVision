import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import SettingsForm from "@/components/settings-form";

export default async function AdminSettingsPage() {
  const session = await getSessionUser();

  if (!session) {
    redirect("/");
  }

  if (session.profile?.role !== "owner") {
    redirect("/tenant");
  }

  const supabase = await createClient();

  const dormId = session.profile?.dorm_id;

  if (!dormId) {
    redirect("/admin");
  }

  const [{ data: dorm }, { data: settings }] = await Promise.all([
    supabase.from("dormitories").select("id, name").eq("id", dormId).single(),

    supabase
      .from("dorm_settings")
      .select(
        `
        id,
        dorm_id,
        billing_due_day,
        grace_period_days,
        late_payment_fee,
        enable_payment_reminders,
        enable_overdue_notifications,
        allow_tenant_registration,
        allow_room_transfers,
        require_transfer_approval,
        enable_new_tenant_notifications,
        enable_maintenance_notifications,
        allow_maintenance_requests,
        require_maintenance_approval
      `
      )
      .eq("dorm_id", dormId)
      .maybeSingle(),
  ]);

  if (!dorm) {
    redirect("/admin");
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8">
        <p className="text-xs text-foreground-muted">Administration</p>
        <h1 className="font-heading text-xl font-semibold text-primary">
          Operational settings
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Manage how {dorm.name} operates.
        </p>
      </div>

      <SettingsForm dorm={dorm} settings={settings} />
    </div>
  );
}
