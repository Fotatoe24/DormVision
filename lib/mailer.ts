import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Pre-warm the connection on module load; failure here just means the
// first real send retries the handshake, nothing to react to.
transporter.verify().catch(() => {});

export async function sendPasswordResetEmail(
  to: string,
  recipientName: string,
  resetLink: string
) {
  await transporter.sendMail({
    from: `"DormVision" <${process.env.GMAIL_USER}>`,
    to,
    subject: "Reset your DormVision password",
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #1b1f1d;">
        <div style="margin-bottom: 32px;">
          <span style="font-size: 18px; font-weight: 600; color: #1f4d3d;">DormVision</span>
        </div>
        <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 12px; color: #1b1f1d;">Reset your password</h2>
        <p style="color: #5b655e; font-size: 14px; line-height: 1.6; margin-bottom: 28px;">
          Hi ${recipientName}, we received a request to reset your DormVision password. This link expires in 1 hour.
        </p>
        <a href="${resetLink}" style="display: inline-block; background: #1f4d3d; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          Reset password
        </a>
        <p style="color: #5b655e; font-size: 12px; margin-top: 32px; line-height: 1.6;">
          If you didn't request this, you can safely ignore this email — your password won't change.
        </p>
      </div>
    `,
  });
}

// ------------------------------------------------------------
// Event notifications (see lib/notifications.ts)
// ------------------------------------------------------------

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Everything interpolated into the HTML below is user-entered somewhere
// (names, request titles, rejection reasons), so it's escaped here once
// instead of trusting each caller to remember.
export async function sendNotificationEmail({
  to,
  subject,
  heading,
  paragraphs,
  cta,
  footer,
}: {
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  footer?: string;
}) {
  // Not configured (e.g. a local checkout without Gmail credentials):
  // notifications are a nice-to-have, so skip quietly rather than erroring.
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;

  const body = paragraphs
    .map(
      (p) =>
        `<p style="color: #5b655e; font-size: 14px; line-height: 1.6; margin: 0 0 14px;">${escapeHtml(p)}</p>`
    )
    .join("");

  const button = cta
    ? `<a href="${escapeHtml(cta.url)}" style="display: inline-block; margin-top: 10px; background: #0c9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">${escapeHtml(cta.label)}</a>`
    : "";

  await transporter.sendMail({
    from: `"DormVision" <${process.env.GMAIL_USER}>`,
    to,
    // Header injection guard: a subject must be a single line.
    subject: subject.replace(/[\r\n]+/g, " ").trim(),
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #1b1f1d;">
        <div style="margin-bottom: 28px;">
          <span style="font-size: 18px; font-weight: 600; color: #0c9488;">DormVision</span>
        </div>
        <h2 style="font-size: 20px; font-weight: 600; margin: 0 0 14px; color: #1b1f1d;">${escapeHtml(heading)}</h2>
        ${body}
        ${button}
        <p style="color: #8a9aa8; font-size: 12px; margin-top: 32px; line-height: 1.6;">
          ${escapeHtml(footer ?? "You're receiving this because of activity on your DormVision account.")}
        </p>
      </div>
    `,
    text: [
      heading,
      "",
      ...paragraphs,
      ...(cta ? ["", `${cta.label}: ${cta.url}`] : []),
    ].join("\n"),
  });
}
