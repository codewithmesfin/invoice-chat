import nodemailer from "nodemailer";

/** First non-empty trimmed value among env keys (order matters). */
function pickEnv(...keys: string[]): string {
  for (const key of keys) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  return "";
}

function envBool(...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const v = process.env[key]?.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
  }
  return undefined;
}

function smtpHost() {
  return pickEnv("SMTP_HOST", "MAIL_SERVER") || "smtp.gmail.com";
}

function smtpPort() {
  const p = Number(pickEnv("SMTP_PORT", "MAIL_PORT") || "587");
  return Number.isFinite(p) && p > 0 ? p : 587;
}

function smtpSecure(port: number) {
  const explicit = envBool("SMTP_SECURE", "MAIL_SSL_TLS");
  if (explicit === true) return true;
  if (explicit === false) return false;
  return port === 465;
}

function smtpRequireTls(port: number, secure: boolean) {
  if (port !== 587 || secure) return false;
  const start = envBool("MAIL_STARTTLS");
  if (start === false) return false;
  return true;
}

/** Login user for SMTP auth (Gmail: full email). */
export function getSmtpAuthUser(): string {
  return pickEnv("SMTP_USER", "GMAIL_USER", "SMTP_USERNAME", "MAIL_USERNAME");
}

/** SMTP password (Gmail: 16-char app password; spaces stripped if pasted with gaps). */
export function getSmtpPassword(): string {
  const raw = pickEnv(
    "SMTP_PASS",
    "SMTP_PASSWORD",
    "GMAIL_APP_PASSWORD",
    "GMAIL_PASS",
    "MAIL_PASSWORD"
  );
  return raw.replace(/\s+/g, "");
}

/**
 * From header for outgoing mail. Supports MAIL_FROM + MAIL_FROM_NAME (Django-style .env).
 */
export function getEmailFrom(): string {
  const name = pickEnv("MAIL_FROM_NAME");
  const mailFrom = pickEnv("MAIL_FROM", "EMAIL_FROM", "SMTP_FROM");
  if (name && mailFrom) {
    const escaped = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}" <${mailFrom}>`;
  }
  if (mailFrom) return mailFrom;

  const login = getSmtpAuthUser();
  if (!login) {
    throw new Error(
      "Missing email sender. Set MAIL_USERNAME + MAIL_FROM, or SMTP_USER / GMAIL_USER (your Gmail address). " +
        "Optional: MAIL_FROM_NAME + MAIL_FROM for a branded From name."
    );
  }
  return login;
}

export function createSmtpTransport() {
  const user = getSmtpAuthUser();
  const pass = getSmtpPassword();
  if (!user || !pass) {
    throw new Error(
      "Missing SMTP credentials. Set MAIL_USERNAME + MAIL_PASSWORD, or SMTP_USER + SMTP_PASS (or GMAIL_*). " +
        "Gmail needs an App Password: Google Account → Security → 2-Step Verification → App passwords."
    );
  }
  const host = smtpHost();
  const port = smtpPort();
  const secure = smtpSecure(port);
  const requireTLS = smtpRequireTls(port, secure);
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    ...(requireTLS ? { requireTLS: true } : {}),
  });
}

export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ messageId: string | undefined }> {
  const transport = createSmtpTransport();
  const from = getEmailFrom();
  const info = await transport.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  return { messageId: info.messageId };
}
