// ============================================================
//  Email helper — config-driven, non-blocking
//
//  Resend is used when RESEND_API_KEY is set; otherwise SMTP via
//  nodemailer when SMTP_HOST is set. If neither is configured the
//  send is skipped. This module NEVER throws — callers rely on the
//  returned EmailResult so that business logic (e.g. onboarding a
//  school) never fails because of email.
// ============================================================

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export type EmailResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

const RESEND_URL = "https://api.resend.com/emails";

function loginUrl(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`;
}

/**
 * Sends an email through the first configured provider (Resend, then SMTP).
 * Never throws — returns a status so callers can surface a warning.
 */
export async function sendEmail(input: SendEmailInput): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (apiKey) {
    return sendViaResend(input, apiKey);
  }

  const smtpHost = process.env.SMTP_HOST?.trim();
  if (smtpHost) {
    return sendViaSmtp(input);
  }

  return {
    status: "skipped",
    reason: "Email is not configured (set RESEND_API_KEY or SMTP_HOST).",
  };
}

async function sendViaResend(
  input: SendEmailInput,
  apiKey: string
): Promise<EmailResult> {
  try {
    const from = process.env.EMAIL_FROM?.trim() || "noreply@yourdomain.com";
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        status: "failed",
        reason: `Resend API returned ${res.status}: ${body.slice(0, 200)}`,
      };
    }

    return { status: "sent" };
  } catch (e) {
    return {
      status: "failed",
      reason: e instanceof Error ? e.message : "Resend request failed.",
    };
  }
}

let smtpTransport: Transporter | null = null;

async function getSmtpTransport(): Promise<Transporter> {
  if (smtpTransport) {
    return smtpTransport;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });
  return smtpTransport;
}

async function sendViaSmtp(input: SendEmailInput): Promise<EmailResult> {
  try {
    const transport = await getSmtpTransport();
    const from = process.env.EMAIL_FROM?.trim() || "noreply@yourdomain.com";
    const info = await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    if (info.rejected && info.rejected.length > 0) {
      return {
        status: "failed",
        reason: `SMTP rejected the recipient: ${String(info.rejected)}`,
      };
    }

    return { status: "sent" };
  } catch (e) {
    return {
      status: "failed",
      reason: e instanceof Error ? e.message : "SMTP send failed.",
    };
  }
}

// ─────────────────────────────────────────────────────────
//  Credentials email for a newly onboarded school
// ─────────────────────────────────────────────────────────

export function schoolCredentialsEmail(args: {
  schoolName: string;
  adminName: string;
  email: string;
  password: string;
}): { subject: string; html: string; text: string } {
  const { schoolName, adminName, email, password } = args;
  const url = loginUrl();

  const subject = `Your ${schoolName} admin login credentials`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
      <div style="background:#2563eb;border-radius:8px 8px 0 0;padding:20px 24px;">
        <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">${schoolName} — Account ready</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
        <p style="margin:0 0 12px;">Hi ${adminName},</p>
        <p style="margin:0 0 16px;">
          Your school's admin account has been created. Use the credentials below to sign in
          at <a href="${url}" style="color:#2563eb;">${url}</a>.
        </p>
        <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="border:1px solid #e2e8f0;padding:10px 14px;color:#64748b;">Username</td>
            <td style="border:1px solid #e2e8f0;padding:10px 14px;font-family:monospace;font-weight:700;">${email}</td>
          </tr>
          <tr>
            <td style="border:1px solid #e2e8f0;padding:10px 14px;color:#64748b;">Password</td>
            <td style="border:1px solid #e2e8f0;padding:10px 14px;font-family:monospace;font-weight:700;">${password}</td>
          </tr>
        </table>
        <p style="margin:16px 0 0;color:#64748b;font-size:13px;">
          Please keep these credentials private and do not share them. If you believe this was sent
          to you in error, contact your school representative.
        </p>
      </div>
    </div>
  `;

  const text = [
    `${schoolName} — Account ready`,
    "",
    `Hi ${adminName},`,
    "",
    `Your school's admin account has been created. Sign in at ${url}`,
    "",
    `Username: ${email}`,
    `Password: ${password}`,
    "",
    "Please keep these credentials private and do not share them.",
  ].join("\n");

  return { subject, html, text };
}