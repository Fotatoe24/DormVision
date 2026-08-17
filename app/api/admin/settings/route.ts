import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth";

export async function PATCH(request: Request) {
  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only dorm owners/admins can change dorm settings
    if (session.profile?.role !== "owner") {
      return NextResponse.json(
        { error: "Only the dorm owner can update settings" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const {
      dormId,

      billingDueDay,
      gracePeriodDays,
      latePaymentFee,

      paymentReminders,
      overdueNotifications,

      tenantRegistration,
      roomTransfers,
      transferApproval,

      newTenantNotifications,
      maintenanceNotifications,

      maintenanceRequests,
      maintenanceApproval,
    } = body;

    if (!dormId) {
      return NextResponse.json(
        { error: "Dormitory ID is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // ---------------------------------------------------------
    // Verify that this owner actually owns the dormitory
    // ---------------------------------------------------------
    const { data: dorm, error: dormError } = await supabase
      .from("dormitories")
      .select("id")
      .eq("id", dormId)
      .eq("owner_id", session.user.id)
      .single();

    if (dormError || !dorm) {
      return NextResponse.json(
        { error: "Dormitory not found or access denied" },
        { status: 403 }
      );
    }

    // ---------------------------------------------------------
    // Validate numeric settings
    // ---------------------------------------------------------
    const dueDay = Number(billingDueDay);
    const graceDays = Number(gracePeriodDays);
    const lateFee = Number(latePaymentFee);

    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      return NextResponse.json(
        { error: "Billing due day must be between 1 and 31" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(graceDays) || graceDays < 0) {
      return NextResponse.json(
        { error: "Grace period must be 0 or greater" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(lateFee) || lateFee < 0) {
      return NextResponse.json(
        { error: "Late payment fee must be 0 or greater" },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // Save settings
    // ---------------------------------------------------------
    const { data: settings, error: settingsError } = await supabase
      .from("dorm_settings")
      .upsert(
        {
          dorm_id: dormId,

          billing_due_day: dueDay,
          grace_period_days: graceDays,
          late_payment_fee: lateFee,

          enable_payment_reminders: Boolean(paymentReminders),
          enable_overdue_notifications: Boolean(overdueNotifications),

          allow_tenant_registration: Boolean(tenantRegistration),
          allow_room_transfers: Boolean(roomTransfers),
          require_transfer_approval: Boolean(transferApproval),

          enable_new_tenant_notifications: Boolean(newTenantNotifications),

          enable_maintenance_notifications: Boolean(maintenanceNotifications),
          allow_maintenance_requests: Boolean(maintenanceRequests),
          require_maintenance_approval: Boolean(maintenanceApproval),
        },
        {
          onConflict: "dorm_id",
        }
      )
      .select()
      .single();

    if (settingsError) {
      console.error("Failed to save dorm settings:", settingsError);

      return NextResponse.json(
        {
          error: "Failed to save dorm settings",
          details: settingsError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("Admin settings PATCH error:", error);

    return NextResponse.json(
      { error: "Something went wrong while saving settings" },
      { status: 500 }
    );
  }
}
