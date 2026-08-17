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
