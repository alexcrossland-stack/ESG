import { Resend } from "resend";
import crypto from "crypto";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_ADDRESS = process.env.EMAIL_FROM || "ESG Manager <noreply@esgmanager.app>";
const BASE_URL = process.env.APP_BASE_URL || "https://esgmanager.app";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY not set — email skipped:", options.subject, "->", options.to);
    return { success: false, error: "Email service not configured" };
  }
  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    return { success: true };
  } catch (err: any) {
    console.error("[Email] Send failed:", err.message);
    return { success: false, error: err.message };
  }
}

export function generateSecureToken(): { plaintext: string; hash: string } {
  const plaintext = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, hash };
}

function emailBase(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESG Manager</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:system-ui,-apple-system,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
  <tr>
    <td style="background:#1a1a1a;border-radius:8px 8px 0 0;padding:24px 32px;text-align:center">
      <span style="color:#4ade80;font-size:20px;font-weight:700">ESG Manager</span>
    </td>
  </tr>
  <tr>
    <td style="background:#ffffff;border-radius:0 0 8px 8px;padding:32px">
      ${content}
    </td>
  </tr>
  <tr>
    <td style="padding:16px 0;text-align:center">
      <p style="color:#6b7280;font-size:12px;margin:0">ESG Manager — Sustainability management for growing businesses</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function buildInvitationEmail(params: { inviteeName: string; companyName: string; inviterName: string; token: string }): SendEmailOptions {
  const link = `${BASE_URL}/auth?invitation=${params.token}`;
  return {
    to: "",
    subject: `You've been invited to ${params.companyName} on ESG Manager`,
    html: emailBase(`
      <h2 style="margin:0 0 16px;color:#111827;font-size:20px">You're invited</h2>
      <p style="color:#374151;margin:0 0 8px">${params.inviterName} has invited you to join <strong>${params.companyName}</strong> on ESG Manager.</p>
      <p style="color:#374151;margin:0 0 24px">Click the button below to accept your invitation and create your account. This link expires in 48 hours.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="${link}" style="background:#1a7a52;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Accept Invitation</a>
      </div>
      <p style="color:#6b7280;font-size:13px;margin:24px 0 0">Or copy this link: <a href="${link}" style="color:#1a7a52">${link}</a></p>
    `),
    text: `${params.inviterName} has invited you to join ${params.companyName} on ESG Manager.\n\nAccept your invitation: ${link}\n\nThis link expires in 48 hours.`,
  };
}

export function buildPasswordResetEmail(params: { token: string }): SendEmailOptions {
  const link = `${BASE_URL}/auth?reset=${params.token}`;
  return {
    to: "",
    subject: "Reset your ESG Manager password",
    html: emailBase(`
      <h2 style="margin:0 0 16px;color:#111827;font-size:20px">Password reset</h2>
      <p style="color:#374151;margin:0 0 24px">We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="${link}" style="background:#1a7a52;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Reset Password</a>
      </div>
      <p style="color:#6b7280;font-size:13px;margin:24px 0 0">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
    `),
    text: `Reset your ESG Manager password:\n${link}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  };
}

export function buildReportReadyEmail(params: { userName: string; companyName: string; period: string; reportType: string }): SendEmailOptions {
  return {
    to: "",
    subject: `Your ESG report is ready — ${params.period}`,
    html: emailBase(`
      <h2 style="margin:0 0 16px;color:#111827;font-size:20px">Your report is ready</h2>
      <p style="color:#374151;margin:0 0 8px">Hi ${params.userName},</p>
      <p style="color:#374151;margin:0 0 24px">Your ${params.reportType} ESG report for <strong>${params.period}</strong> has been generated for <strong>${params.companyName}</strong>.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="${BASE_URL}/reports" style="background:#1a7a52;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">View Report</a>
      </div>
    `),
    text: `Your ${params.reportType} ESG report for ${params.period} is ready. View it at: ${BASE_URL}/reports`,
  };
}

export function buildSupportConfirmationEmail(params: { userName: string; refNumber: string; subject: string }): SendEmailOptions {
  return {
    to: "",
    subject: `Support request received — ${params.refNumber}`,
    html: emailBase(`
      <h2 style="margin:0 0 16px;color:#111827;font-size:20px">We've received your request</h2>
      <p style="color:#374151;margin:0 0 8px">Hi ${params.userName || "there"},</p>
      <p style="color:#374151;margin:0 0 16px">Your support request has been received. Here are the details:</p>
      <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:0 0 24px">
        <p style="margin:0 0 8px;color:#374151"><strong>Reference:</strong> <span style="font-family:monospace;background:#e5e7eb;padding:2px 8px;border-radius:4px">${params.refNumber}</span></p>
        <p style="margin:0;color:#374151"><strong>Subject:</strong> ${params.subject}</p>
      </div>
      <p style="color:#374151;margin:0 0 8px">Our team will review your request and respond within 2 business days.</p>
      <p style="color:#6b7280;font-size:13px;margin:0">You can also reach us directly at <a href="mailto:support@esgmanager.app" style="color:#1a7a52">support@esgmanager.app</a></p>
    `),
    text: `Support request received.\nReference: ${params.refNumber}\nSubject: ${params.subject}\n\nWe'll respond within 2 business days. Email us at support@esgmanager.app`,
  };
}

export function buildEvidenceExpiryEmail(params: { companyName: string; filename: string; daysUntil: number; expiryDate: string }): SendEmailOptions {
  return {
    to: "",
    subject: `Evidence expiring in ${params.daysUntil} days — ${params.filename}`,
    html: emailBase(`
      <h2 style="margin:0 0 16px;color:#111827;font-size:20px">Evidence file expiring soon</h2>
      <p style="color:#374151;margin:0 0 16px">The following evidence file for <strong>${params.companyName}</strong> will expire in <strong>${params.daysUntil} days</strong>:</p>
      <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:16px;margin:0 0 24px">
        <p style="margin:0 0 4px;color:#92400e;font-weight:600">${params.filename}</p>
        <p style="margin:0;color:#92400e;font-size:13px">Expires: ${params.expiryDate}</p>
      </div>
      <div style="text-align:center;margin:24px 0">
        <a href="${BASE_URL}/evidence" style="background:#1a7a52;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Review Evidence</a>
      </div>
    `),
    text: `Evidence file "${params.filename}" expires in ${params.daysUntil} days (${params.expiryDate}). Review it at: ${BASE_URL}/evidence`,
  };
}
