import { sendNotificationEmail } from "@/lib/mailer";
import { formatBillDate, formatMoney } from "@/lib/billing";
import type { PlannedEmail } from "@/lib/reminders";

// Unlike lib/notifications.ts, this THROWS when the email can't be sent: the
// daily job records "sent" only after this succeeds, and un-records it if it
// fails, so a failed email is retried tomorrow instead of silently lost.
export async function sendReminderEmail(
  origin: string,
  dormName: string,
  planned: PlannedEmail
) {
  const firstName = planned.name.split(" ")[0] || "there";
  const amount = formatMoney(planned.balance);
  const due = formatBillDate(planned.dueDate);
  const cta = { label: "View my bill", url: `${origin}/tenant/billing` };
  const footer = `You're receiving this because ${dormName} has payment reminders switched on.`;

  if (planned.kind === "payment_reminder") {
    const when =
      planned.daysUntilDue === 0
        ? "today"
        : planned.daysUntilDue === 1
          ? "tomorrow"
          : `in ${planned.daysUntilDue} days`;

    await sendNotificationEmail({
      to: planned.email,
      subject: `Rent reminder: ${amount} due ${when}`,
      heading: "Your rent is due soon",
      paragraphs: [
        `Hi ${firstName}, your balance of ${amount} at ${dormName} is due ${when} (${due}).`,
        "Pay your dorm owner, then report the payment in DormVision so they can confirm it.",
      ],
      cta,
      footer,
    });
    return;
  }

  await sendNotificationEmail({
    to: planned.email,
    subject: `Overdue: ${amount} at ${dormName}`,
    heading: "Your payment is overdue",
    paragraphs: [
      `Hi ${firstName}, your balance of ${amount} at ${dormName} was due on ${due} and is now overdue.`,
      ...(planned.lateFee > 0
        ? [`This includes a late payment fee of ${formatMoney(planned.lateFee)}.`]
        : []),
      "Please pay your dorm owner and report the payment in DormVision. If you've already paid, you can ignore this and report it so the owner can confirm.",
    ],
    cta,
    footer,
  });
}
