import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotificationEmail } from "@/lib/mailer";
import { getNotificationSettings } from "@/lib/notification-settings";
import { getMaintenanceSettings } from "@/lib/maintenance-settings";
import { formatBillDate, formatMoney, paymentMethodLabels } from "@/lib/billing";

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

// Several tenants' contacts in two queries (tenants, then their accounts)
// instead of two per tenant.
async function tenantContacts(tenantIds: string[]) {
  const contacts = new Map<
    string,
    { email: string; fullName: string; dormId: string | null }
  >();
  if (tenantIds.length === 0) return contacts;

  const admin = createAdminClient();
  const { data: tenants } = await admin
    .from("tenants")
    .select("id, full_name, dorm_id, profile_id")
    .in("id", tenantIds);

  const profileIds = (tenants ?? [])
    .map((t) => t.profile_id)
    .filter((id): id is string => Boolean(id));
  if (profileIds.length === 0) return contacts;

  const { data: users } = await admin
    .from("users")
    .select("id, email, disabled_at")
    .in("id", profileIds);
  const userById = new Map((users ?? []).map((u) => [u.id, u]));

  for (const tenant of tenants ?? []) {
    const user = tenant.profile_id ? userById.get(tenant.profile_id) : null;
    if (user?.email && !user.disabled_at) {
      contacts.set(tenant.id, {
        email: user.email,
        fullName: tenant.full_name,
        dormId: tenant.dorm_id,
      });
    }
  }
  return contacts;
}

// The owner issued a bill. One email per tenant, a few at a time so generating a
// whole dorm's bills never opens dozens of mail connections at once.
// Transactional, like the other tenant-facing emails: not behind a toggle.
export function notifyTenantsNewBill(
  origin: string,
  items: { tenantId: string; amount: number; dueDate: string }[]
) {
  return safely("new bills", async () => {
    const contacts = await tenantContacts(items.map((i) => i.tenantId));
    const dormNames = new Map<string, string>();

    const send = async (item: (typeof items)[number]) => {
      const contact = contacts.get(item.tenantId);
      if (!contact) return;

      if (contact.dormId && !dormNames.has(contact.dormId)) {
        dormNames.set(contact.dormId, await dormName(contact.dormId));
      }
      const dorm = (contact.dormId && dormNames.get(contact.dormId)) || "your dormitory";
      const amount = formatMoney(item.amount);
      const due = formatBillDate(item.dueDate);

      await sendNotificationEmail({
        to: contact.email,
        subject: `New bill: ${amount} due ${due}`,
        heading: "You have a new bill",
        paragraphs: [
          `Hi ${contact.fullName.split(" ")[0] || "there"}, ${dorm} issued a new bill of ${amount}, due on ${due}.`,
          "Pay your dorm owner, then report the payment in DormVision so they can confirm it.",
        ],
        cta: { label: "View my bill", url: `${origin}/tenant/billing` },
        footer: `You're receiving this because ${dorm} billed you through DormVision.`,
      });
    };

    const BATCH = 5;
    for (let i = 0; i < items.length; i += BATCH) {
      // One failed address must not stop the rest.
      await Promise.all(
        items.slice(i, i + BATCH).map((item) =>
          send(item).catch((error) =>
            console.error("Notification failed (new bill):", error)
          )
        )
      );
    }
  });
}

// The owner moved a maintenance request along. "pending" (a reset) is not news.
const MAINTENANCE_UPDATES: Record<
  string,
  { subject: string; heading: string; line: string }
> = {
  acknowledged: {
    subject: "Your maintenance request was received",
    heading: "Your request was acknowledged",
    line: "has been acknowledged by your dorm owner.",
  },
  in_progress: {
    subject: "Work has started on your maintenance request",
    heading: "Work has started",
    line: "is now being worked on.",
  },
  completed: {
    subject: "Your maintenance request is completed",
    heading: "Your request is completed",
    line: "has been marked as completed.",
  },
  rejected: {
    subject: "Update on your maintenance request",
    heading: "Your request wasn't accepted",
    line: "couldn't be accepted by your dorm owner. You can contact them for details, or submit a new request.",
  },
};

export function notifyTenantMaintenanceUpdate(
  origin: string,
  tenantId: string,
  requestTitle: string,
  status: string
) {
  return safely("maintenance update", async () => {
    const copy = MAINTENANCE_UPDATES[status];
    if (!copy) return;

    const contact = (await tenantContacts([tenantId])).get(tenantId);
    if (!contact) return;

    await sendNotificationEmail({
      to: contact.email,
      subject: copy.subject,
      heading: copy.heading,
      paragraphs: [
        `Hi ${contact.fullName.split(" ")[0] || "there"}, your request "${requestTitle}" ${copy.line}`,
      ],
      cta: { label: "View my requests", url: `${origin}/tenant/maintenance` },
    });
  });
}

// ------------------------------------------------------------
// Platform-admin related
// ------------------------------------------------------------

async function adminEmails() {
  const { data } = await createAdminClient()
    .from("users")
    .select("email")
    .eq("role", "platform_admin")
    .is("disabled_at", null);

  return (data ?? []).map((u) => u.email).filter(Boolean) as string[];
}

// A new owner signed up while "require approval" is on.
export function notifyAdminsNewDormPending(
  origin: string,
  dormName: string,
  ownerName: string
) {
  return safely("new dorm pending", async () => {
    const emails = await adminEmails();

    await Promise.all(
      emails.map((to) =>
        sendNotificationEmail({
          to,
          subject: `Dormitory awaiting approval: ${dormName}`,
          heading: "A new dormitory needs approval",
          paragraphs: [
            `${ownerName} signed up with the dormitory "${dormName}".`,
            "They can't sign in until you approve it.",
          ],
          cta: { label: "Review it", url: `${origin}/platform/dorms?status=pending` },
        })
      )
    );
  });
}

// The platform admin acted on a dorm: tell its owner(s) what happened.
export function notifyOwnersDormDecision(
  origin: string,
  dormId: string,
  decision: "approved" | "rejected" | "suspended" | "reactivated",
  reason?: string | null
) {
  return safely(`dorm ${decision}`, async () => {
    const [emails, name] = await Promise.all([ownerEmails(dormId), dormName(dormId)]);

    const copy = {
      approved: {
        subject: `${name} was approved`,
        heading: "Your dormitory was approved",
        lines: [`${name} is approved. You can sign in and start setting it up.`],
        cta: "Sign in",
      },
      rejected: {
        subject: `${name} wasn't approved`,
        heading: "Your dormitory wasn't approved",
        lines: [`We couldn't approve ${name}.`],
        cta: null,
      },
      suspended: {
        subject: `${name} was suspended`,
        heading: "Your dormitory was suspended",
        lines: [`${name} has been suspended. You and your tenants can't sign in for now.`],
        cta: null,
      },
      reactivated: {
        subject: `${name} is active again`,
        heading: "Your dormitory is active again",
        lines: [`The suspension on ${name} was lifted. You and your tenants can sign in again.`],
        cta: "Sign in",
      },
    }[decision];

    await Promise.all(
      emails.map((to) =>
        sendNotificationEmail({
          to,
          subject: copy.subject,
          heading: copy.heading,
          paragraphs: [...copy.lines, ...(reason ? [`Reason: ${reason}`] : [])],
          ...(copy.cta ? { cta: { label: copy.cta, url: `${origin}/` } } : {}),
        })
      )
    );
  });
}

// Someone signed in as the platform admin. Sent to every admin, so an
// unexpected one is noticed.
export function notifyAdminSignIn(email: string, ip: string, whenIso: string) {
  return safely("admin sign-in", async () => {
    await sendNotificationEmail({
      to: email,
      subject: "Platform admin sign-in",
      heading: "Your admin account was just used to sign in",
      paragraphs: [
        `Time: ${new Date(whenIso).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Manila)`,
        `Network address: ${ip}`,
        "If this wasn't you, reset the admin password right away.",
      ],
    });
  });
}
