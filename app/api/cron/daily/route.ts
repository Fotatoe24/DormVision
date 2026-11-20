import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyLateFees } from "@/lib/late-fees";
import { getSiteOrigin } from "@/lib/site-origin";
import { sendReminderEmail } from "@/lib/reminder-emails";
import {
  OVERDUE_LOOKBACK_DAYS,
  REMINDER_LEAD_DAYS,
  manilaToday,
  planReminders,
  type ReminderDormSettings,
} from "@/lib/reminders";

// The once-a-day job (schedule in vercel.json). It:
//   1. charges late fees on every bill that has gone past due + grace, so the
//      fee lands on time even if nobody opens the app; and
//   2. emails tenants a payment reminder / overdue notice, once per bill,
//      respecting each owner's Settings toggles.
//
// Vercel calls this with `Authorization: Bearer <CRON_SECRET>`. With no secret
// configured, or the wrong one, it does nothing: it must never be a public
// button that sends email.

// A Gmail account can only send so many messages a day; a bug or a backlog must
// not burn the whole quota in one run. Anything over the cap waits for tomorrow.
const MAX_EMAILS_PER_RUN = 150;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("The daily job is disabled: set CRON_SECRET (see .env.example).");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = manilaToday();

  // Only dorms that are live: not suspended, not waiting for approval.
  const { data: dorms, error: dormsError } = await admin
    .from("dormitories")
    .select("id, name, suspended_at, approved_at");

  if (dormsError) {
    console.error("Daily job: could not load dorms:", dormsError);
    return NextResponse.json({ error: "Could not load dorms" }, { status: 500 });
  }

  const liveDorms = (dorms ?? []).filter(
    (d) => !d.suspended_at && d.approved_at !== null
  );
  const dormName = new Map(liveDorms.map((d) => [d.id, d.name as string]));
  const dormIds = liveDorms.map((d) => d.id as string);

  // ---------- 1. Late fees ----------
  let feesCharged = 0;
  for (const dormId of dormIds) {
    feesCharged += await applyLateFees(dormId);
  }

  // ---------- 2. Reminders ----------
  const summary = {
    ok: true,
    date: today,
    dorms: dormIds.length,
    feesCharged,
    emails: { planned: 0, sent: 0, failed: 0, skippedOverCap: 0 },
    emailsConfigured: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
  };

  // Without Gmail credentials the mailer skips silently; recording those as
  // "sent" would mean the tenant is never reminded once it IS configured.
  if (!summary.emailsConfigured || dormIds.length === 0) {
    return NextResponse.json(summary);
  }

  // Unpaid bills only, and only ones that can matter today: due within the
  // reminder window, or recently late.
  const { data: bills, error: billsError } = await admin
    .from("bills")
    .select("id, tenant_id, dorm_id, due_date, total_amount, amount_paid, late_fee")
    .in("dorm_id", dormIds)
    .neq("status", "paid")
    .lte("due_date", addDays(today, REMINDER_LEAD_DAYS))
    .gte("due_date", addDays(today, -OVERDUE_LOOKBACK_DAYS));

  if (billsError) {
    console.error("Daily job: could not load bills:", billsError);
    return NextResponse.json({ ...summary, ok: false, error: "Could not load bills" }, { status: 500 });
  }

  const billRows = bills ?? [];
  if (billRows.length === 0) return NextResponse.json(summary);

  const tenantIds = [...new Set(billRows.map((b) => b.tenant_id as string))];
  const billIds = billRows.map((b) => b.id as string);

  const [tenantsResult, settingsResult, sentResult] = await Promise.all([
    admin.from("tenants").select("id, full_name, profile_id").in("id", tenantIds).eq("status", "active"),
    admin
      .from("dorm_settings")
      .select("dorm_id, grace_period_days, enable_payment_reminders, enable_overdue_notifications")
      .in("dorm_id", dormIds),
    admin.from("notification_log").select("bill_id, kind").in("bill_id", billIds),
  ]);

  // No log table (migration 0030 not run) means we can't tell what was already
  // sent. Sending anyway would repeat every email every day, so stop.
  if (sentResult.error) {
    console.error("Daily job: cannot read notification_log (run migration 0030):", sentResult.error);
    return NextResponse.json({ ...summary, ok: false, error: "notification_log unavailable" }, { status: 500 });
  }
  if (tenantsResult.error || settingsResult.error) {
    console.error("Daily job: lookup failed:", tenantsResult.error ?? settingsResult.error);
    return NextResponse.json({ ...summary, ok: false, error: "Lookup failed" }, { status: 500 });
  }

  const profileIds = (tenantsResult.data ?? [])
    .map((t) => t.profile_id as string | null)
    .filter((id): id is string => Boolean(id));

  const { data: users } = profileIds.length
    ? await admin.from("users").select("id, email, full_name, disabled_at").in("id", profileIds)
    : { data: [] };

  const userById = new Map((users ?? []).map((u) => [u.id, u]));

  const recipients = new Map<string, { email: string; name: string }>();
  for (const tenant of tenantsResult.data ?? []) {
    const user = tenant.profile_id ? userById.get(tenant.profile_id) : null;
    if (user?.email && !user.disabled_at) {
      recipients.set(tenant.id, { email: user.email, name: tenant.full_name ?? user.full_name ?? "" });
    }
  }

  const settings = new Map<string, ReminderDormSettings>(
    (settingsResult.data ?? []).map((s) => [
      s.dorm_id as string,
      {
        graceDays: s.grace_period_days ?? 0,
        paymentReminders: s.enable_payment_reminders ?? true,
        overdueNotifications: s.enable_overdue_notifications ?? true,
      },
    ])
  );

  const alreadySent = new Set(
    (sentResult.data ?? []).map((row) => `${row.bill_id}:${row.kind}`)
  );

  const planned = planReminders({
    bills: billRows.map((b) => ({ ...b, id: b.id as string })) as Parameters<typeof planReminders>[0]["bills"],
    recipients,
    settings,
    alreadySent,
    today,
  });

  summary.emails.planned = planned.length;

  const origin = await getSiteOrigin();

  for (const email of planned.slice(0, MAX_EMAILS_PER_RUN)) {
    // Claim first: the unique (bill_id, kind) key lets exactly one run win, so
    // two overlapping runs can't both send it. `ignoreDuplicates` returns no
    // row when someone else already holds the claim.
    const { data: claimed, error: claimError } = await admin
      .from("notification_log")
      .upsert(
        { bill_id: email.billId, kind: email.kind },
        { onConflict: "bill_id,kind", ignoreDuplicates: true }
      )
      .select("id");

    if (claimError) {
      console.error("Daily job: could not claim", email.billId, claimError);
      summary.emails.failed++;
      continue;
    }
    if (!claimed || claimed.length === 0) continue;

    try {
      await sendReminderEmail(origin, dormName.get(email.dormId) ?? "your dormitory", email);
      summary.emails.sent++;
    } catch (error) {
      // Release the claim so tomorrow's run tries again.
      console.error("Daily job: email failed for bill", email.billId, error);
      await admin.from("notification_log").delete().eq("id", claimed[0].id);
      summary.emails.failed++;
    }
  }

  summary.emails.skippedOverCap = Math.max(0, planned.length - MAX_EMAILS_PER_RUN);

  return NextResponse.json(summary);
}
