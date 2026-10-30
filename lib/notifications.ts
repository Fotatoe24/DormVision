import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotificationEmail } from "@/lib/mailer";
import { getNotificationSettings } from "@/lib/notification-settings";
import { getMaintenanceSettings } from "@/lib/maintenance-settings";
import { formatMoney, paymentMethodLabels } from "@/lib/billing";

// Email notifications for the events people actually wait on. Each function:
//
//  - looks up its own recipients, so call sites only say WHAT happened;
//  - respects the owner's Settings toggles where one exists;
//  - never throws -- an email problem must not undo or block the action that
//    caused it (the callers also run these via `after()`, see queueEmail in
//    lib/actions.ts).
//
// The tenant-facing "payment reminder" / "overdue" toggles are NOT handled
// here: those are time-based, and nothing in the app runs on a schedule yet.

const OWNER_FOOTER =
  "You're receiving this as a dorm owner. Turn these alerts off under Settings → Notifications.";

async function dormName(dormId: string | null | undefined) {
  if (!dormId) return "your dormitory";

  const admin = createAdminClient();
  const { data } = await admin
    .from("dormitories")
    .select("name")
    .eq("id", dormId)
    .maybeSingle();

  return data?.name ?? "your dormitory";
}

async function ownerEmails(dormId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("email")
    .eq("dorm_id", dormId)
    .eq("role", "owner");

  return (data ?? []).map((u) => u.email).filter(Boolean) as string[];
}

async function emailOfUser(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();

  return data;
}

// tenants.id -> the tenant's account email (+ the tenant row itself).
async function tenantContact(tenantId: string) {
  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("full_name, dorm_id, profile_id")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant?.profile_id) return null;

  const user = await emailOfUser(tenant.profile_id);
  if (!user?.email) return null;

  return { tenant, email: user.email };
}

async function safely(label: string, work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    console.error(`Notification failed (${label}):`, error);
  }
}

// ------------------------------------------------------------
// Owner-facing
// ------------------------------------------------------------

// A tenant asked to join (first sign-up, or applying again / to a new dorm).
export function notifyOwnerNewRegistration(
  origin: string,
  dormId: string,
  applicantName: string
) {
  return safely("new registration", async () => {
    const { newTenantNotifications } = await getNotificationSettings(dormId);
    if (!newTenantNotifications) return;

    const [emails, name] = await Promise.all([
      ownerEmails(dormId),
      dormName(dormId),
    ]);

    await Promise.all(
      emails.map((to) =>
        sendNotificationEmail({
          to,
          subject: `New tenant request: ${applicantName}`,
          heading: "A new tenant wants to join",
          paragraphs: [
            `${applicantName} has asked to join ${name}.`,
            "Review the request to approve or reject it.",
          ],
          cta: {
            label: "Review request",
            url: `${origin}/admin/tenant-requests`,
          },
          footer: OWNER_FOOTER,
        })
      )
    );
  });
}

// A tenant says they've paid and is waiting for confirmation.
export function notifyOwnerPaymentReported(
  origin: string,
  tenantId: string,
  amount: number,
  method: string,
  hasProof = false
) {
  return safely("payment reported", async () => {
    const contact = await tenantContact(tenantId);
    if (!contact?.tenant.dorm_id) return;

    const emails = await ownerEmails(contact.tenant.dorm_id);
    const money = formatMoney(amount);
    const via = paymentMethodLabels[method] ?? method;

    await Promise.all(
      emails.map((to) =>
        sendNotificationEmail({
          to,
          subject: `Payment to confirm: ${contact.tenant.full_name} · ${money}`,
          heading: "A payment is waiting for your confirmation",
          paragraphs: [
            `${contact.tenant.full_name} reported a payment of ${money} (${via}).`,
            ...(hasProof
              ? ["They attached a photo or screenshot of their payment. You can view it in the app."]
              : []),
            "Confirm it once you've received the money, or reject it if something's off.",
          ],
          cta: { label: "Review payment", url: `${origin}/admin/payments` },
          footer: OWNER_FOOTER,
        })
      )
    );
  });
}

// A tenant filed a maintenance request. Governed by the owner's
// "Maintenance notifications" toggle (the same one behind the nav badge).
export function notifyOwnerMaintenanceRequest(
  origin: string,
  tenantId: string,
  dormId: string,
  title: string
) {
  return safely("maintenance request", async () => {
    const { notifyOwner } = await getMaintenanceSettings(dormId);
    if (!notifyOwner) return;

    const [emails, contact] = await Promise.all([
      ownerEmails(dormId),
      tenantContact(tenantId),
    ]);
    const who = contact?.tenant.full_name ?? "A tenant";

    await Promise.all(
      emails.map((to) =>
        sendNotificationEmail({
          to,
          subject: `New maintenance request: ${title}`,
          heading: "A new maintenance request",
          paragraphs: [`${who} submitted a request: "${title}".`],
          cta: {
            label: "View request",
            url: `${origin}/admin/maintenance`,
          },
          footer: OWNER_FOOTER,
        })
      )
    );
  });
}

// ------------------------------------------------------------
// Tenant-facing (transactional -- not behind a toggle)
// ------------------------------------------------------------

export function notifyTenantRegistrationDecision(
  origin: string,
  userId: string,
  dormId: string,
  approved: boolean,
  reason?: string | null
) {
  return safely("registration decision", async () => {
    const [user, name] = await Promise.all([
      emailOfUser(userId),
      dormName(dormId),
    ]);
    if (!user?.email) return;

    await sendNotificationEmail({
      to: user.email,
      subject: approved
        ? `You're approved at ${name}`
        : `Update on your request to ${name}`,
      heading: approved
        ? "Your request was approved"
        : "Your request wasn't approved",
      paragraphs: approved
        ? [
            `Hi ${user.full_name}, the owner of ${name} approved your request.`,
            "They'll assign you a room next. You can already sign in to see your dashboard.",
          ]
        : [
            `Hi ${user.full_name}, the owner of ${name} didn't approve your request.`,
            ...(reason ? [`Reason given: ${reason}`] : []),
            "You can contact the dorm owner, or submit a new request from your account.",
          ],
      cta: { label: "Open DormVision", url: `${origin}/tenant` },
    });
  });
}

export function notifyTenantPaymentDecision(
  origin: string,
  tenantId: string,
  amount: number,
  confirmed: boolean,
  note?: string | null
) {
  return safely("payment decision", async () => {
    const contact = await tenantContact(tenantId);
    if (!contact) return;

    const money = formatMoney(amount);

    await sendNotificationEmail({
      to: contact.email,
      subject: confirmed
        ? `Your payment of ${money} was confirmed`
        : `Your payment report of ${money} wasn't accepted`,
      heading: confirmed ? "Payment confirmed" : "Payment report not accepted",
      paragraphs: confirmed
        ? [
            `Hi ${contact.tenant.full_name}, your dorm owner confirmed your payment of ${money}.`,
            "A receipt is available on your Billing page.",
          ]
        : [
            `Hi ${contact.tenant.full_name}, your dorm owner couldn't accept your payment report of ${money}.`,
            ...(note ? [`Their note: ${note}`] : []),
            "Please check with them, then report it again if you've paid.",
          ],
      cta: { label: "View billing", url: `${origin}/tenant/billing` },
    });
  });
}
