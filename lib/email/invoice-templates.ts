import type { InvoiceLineNormalized } from "@/lib/invoices/invoice-lines";
import { INVOICE_PRINT } from "@/lib/invoices/invoice-print-theme";

export type InvoiceEmailBranding = {
  appName: string;
  accentColor: string;
};

const defaultBranding: InvoiceEmailBranding = {
  appName: "Invoicing",
  accentColor: "#0ea5e9",
};

function layout(inner: string, branding: InvoiceEmailBranding) {
  const { appName, accentColor } = branding;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(appName)}</title>
</head>
<body style="margin:0;background:#f4f6fb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,0.08);">
          <tr>
            <td style="padding:28px 28px 8px 28px;">
              <div style="font-size:13px;font-weight:600;letter-spacing:0.04em;color:${accentColor};text-transform:uppercase;">${escapeHtml(appName)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px 28px;font-size:15px;line-height:1.6;color:#334155;">
              ${inner}
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 24px 28px;font-size:12px;line-height:1.5;color:#94a3b8;">
              If you were not expecting this message, you can ignore it.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoneyEmail(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function formatQtyEmail(q: number) {
  if (Number.isInteger(q)) return String(q);
  return String(q);
}

function padLineNoEmail(i: number) {
  return String(i).padStart(2, "0");
}

/** Printable-style invoice block for HTML emails — matches on-page print template. */
export function buildInvoiceEmailDocumentSection(opts: {
  branding: InvoiceEmailBranding;
  invoiceNumber: string;
  currency: string;
  totalCents: number;
  issuedDateLabel: string | null;
  dueDateLabel: string | null;
  billToName: string;
  billToEmail: string | null;
  lines: InvoiceLineNormalized[];
  notesPreview: string | null;
}) {
  const { branding } = opts;
  const p = INVOICE_PRINT;
  const subtotalCents = opts.lines.reduce((s, l) => s + l.lineTotalCents, 0);

  const rowHtml = opts.lines
    .map(
      (line, idx) => `
    <tr>
      <td style="padding:8px 6px;border-bottom:1px solid ${p.border};font-size:13px;color:${p.ink};">${escapeHtml(padLineNoEmail(idx + 1))}</td>
      <td style="padding:8px 6px;border-bottom:1px solid ${p.border};font-size:13px;color:${p.ink};">${escapeHtml(line.description)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid ${p.border};font-size:13px;color:${p.ink};text-align:right;white-space:nowrap;">${escapeHtml(formatQtyEmail(line.quantity))}</td>
      <td style="padding:8px 6px;border-bottom:1px solid ${p.border};font-size:13px;font-weight:600;color:${p.ink};text-align:right;white-space:nowrap;">${escapeHtml(formatMoneyEmail(line.lineTotalCents, opts.currency))}</td>
    </tr>`
    )
    .join("");

  const billEmail = opts.billToEmail
    ? `<div style="margin-top:4px;font-size:12px;color:#64748b;">${escapeHtml(opts.billToEmail)}</div>`
    : "";

  const issued = opts.issuedDateLabel ? escapeHtml(opts.issuedDateLabel) : "—";
  const due = opts.dueDateLabel ? escapeHtml(opts.dueDateLabel) : "—";

  const termsSection = opts.notesPreview
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;">
         <tr>
           <td style="vertical-align:top;width:62%;padding-right:12px;">
             <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;color:${p.label};text-transform:uppercase;">Terms and condition</div>
             <div style="margin-top:6px;font-size:12px;line-height:1.55;color:#64748b;white-space:pre-wrap;">${escapeHtml(opts.notesPreview)}</div>
           </td>
           <td style="vertical-align:bottom;text-align:right;padding-left:8px;">
             <div style="border-bottom:1px solid ${p.ink};min-width:140px;margin-left:auto;margin-bottom:6px;"></div>
             <div style="font-size:12px;font-weight:700;color:${p.ink};">${escapeHtml(branding.appName)}</div>
             <div style="font-size:9px;font-weight:700;letter-spacing:0.1em;color:#64748b;text-transform:uppercase;margin-top:3px;">Authorized signature</div>
           </td>
         </tr>
       </table>`
    : "";

  return `
  <div style="margin:20px 0;border:1px solid ${p.border};border-radius:8px;overflow:hidden;background:#ffffff;">
    <div style="height:8px;background:${p.topBar};"></div>
    <div style="padding:14px 16px 8px 16px;background:#ffffff;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td style="vertical-align:top;width:55%;">
            <span style="display:inline-block;width:9px;height:9px;background:${p.ink};margin-right:4px;"></span><span style="display:inline-block;width:9px;height:9px;background:${p.ink};margin-right:4px;"></span><span style="display:inline-block;width:9px;height:9px;background:${p.ink};"></span>
            <div style="margin-top:10px;font-size:12px;font-weight:600;color:#64748b;">${escapeHtml(branding.appName)}</div>
          </td>
          <td style="vertical-align:top;text-align:right;">
            <div style="font-size:20px;font-weight:800;color:${p.ink};line-height:1.1;">INVOICE</div>
            <div style="font-size:20px;font-weight:800;color:${p.ink};">#${escapeHtml(opts.invoiceNumber)}</div>
          </td>
        </tr>
      </table>
    </div>
    <div style="padding:4px 16px 16px 16px;background:#ffffff;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td style="vertical-align:top;width:33%;padding-right:8px;">
            <div style="font-size:9px;font-weight:700;letter-spacing:0.1em;color:${p.label};text-transform:uppercase;">Prepared for:</div>
            <div style="margin-top:4px;font-size:14px;font-weight:600;color:${p.ink};">${escapeHtml(opts.billToName)}</div>
            ${billEmail}
          </td>
          <td style="vertical-align:top;width:33%;padding:0 8px;">
            <div style="font-size:9px;font-weight:700;letter-spacing:0.1em;color:${p.label};text-transform:uppercase;">Date issued:</div>
            <div style="margin-top:4px;font-size:14px;font-weight:600;color:${p.ink};">${issued}</div>
          </td>
          <td style="vertical-align:top;width:34%;padding-left:8px;">
            <div style="font-size:9px;font-weight:700;letter-spacing:0.1em;color:${p.label};text-transform:uppercase;">Due date:</div>
            <div style="margin-top:4px;font-size:14px;font-weight:600;color:${p.ink};">${due}</div>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border-collapse:collapse;">
        <thead>
          <tr>
            <th align="left" style="width:36px;padding:6px 6px 8px 0;border-bottom:1px solid #cbd5e1;font-size:9px;font-weight:700;letter-spacing:0.06em;color:${p.label};text-transform:uppercase;">No</th>
            <th align="left" style="padding:6px 6px 8px 6px;border-bottom:1px solid #cbd5e1;font-size:9px;font-weight:700;letter-spacing:0.06em;color:${p.label};text-transform:uppercase;">Item description</th>
            <th align="right" style="padding:6px 6px 8px 6px;border-bottom:1px solid #cbd5e1;font-size:9px;font-weight:700;letter-spacing:0.06em;color:${p.label};text-transform:uppercase;">Quantity</th>
            <th align="right" style="padding:6px 0 8px 6px;border-bottom:1px solid #cbd5e1;font-size:9px;font-weight:700;letter-spacing:0.06em;color:${p.label};text-transform:uppercase;">Cost</th>
          </tr>
        </thead>
        <tbody>${rowHtml}</tbody>
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:4px;">
        <tr>
          <td align="right" style="padding:8px 0 0 0;">
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin-left:auto;">
              <tr>
                <td style="padding:4px 12px 4px 0;font-size:11px;color:#64748b;text-transform:uppercase;">Sub total:</td>
                <td style="padding:4px 0;font-size:14px;font-weight:600;color:${p.ink};text-align:right;">${escapeHtml(formatMoneyEmail(subtotalCents, opts.currency))}</td>
              </tr>
              <tr><td colspan="2" style="border-top:1px solid ${p.border};height:8px;"></td></tr>
              <tr>
                <td style="padding:2px 12px 0 0;font-size:12px;font-weight:800;color:${p.accent};text-transform:uppercase;">Total:</td>
                <td style="padding:2px 0 0 0;font-size:17px;font-weight:800;color:${p.accent};text-align:right;">${escapeHtml(formatMoneyEmail(opts.totalCents, opts.currency))}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      ${termsSection}
    </div>
  </div>`;
}

export function buildInvoiceLinkEmail(opts: {
  customerName: string;
  invoiceNumber: string;
  amountLabel: string;
  dueLabel: string | null;
  payUrl: string;
  branding?: Partial<InvoiceEmailBranding>;
  /** When provided, renders a standard invoice-style summary block in the email body. */
  invoiceDocument?: {
    currency: string;
    totalCents: number;
    issuedDateLabel: string | null;
    billToName: string;
    billToEmail: string | null;
    lines: InvoiceLineNormalized[];
    notesPreview: string | null;
  };
}) {
  const b = { ...defaultBranding, ...opts.branding };
  const doc =
    opts.invoiceDocument &&
    buildInvoiceEmailDocumentSection({
      branding: b,
      invoiceNumber: opts.invoiceNumber,
      currency: opts.invoiceDocument.currency,
      totalCents: opts.invoiceDocument.totalCents,
      issuedDateLabel: opts.invoiceDocument.issuedDateLabel,
      dueDateLabel: opts.dueLabel,
      billToName: opts.invoiceDocument.billToName,
      billToEmail: opts.invoiceDocument.billToEmail,
      lines: opts.invoiceDocument.lines,
      notesPreview: opts.invoiceDocument.notesPreview,
    });
  const inner = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(opts.customerName)},</p>
    <p style="margin:0 0 16px 0;">Please find invoice <strong>#${escapeHtml(opts.invoiceNumber)}</strong> for <strong>${escapeHtml(opts.amountLabel)}</strong> below.</p>
    ${doc ?? ""}
    <p style="margin:24px 0 16px 0;text-align:center;">
      <a href="${escapeHtml(opts.payUrl)}" style="display:inline-block;padding:14px 28px;background:${b.accentColor};color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:15px;">Pay securely</a>
    </p>
    <p style="margin:0 0 12px 0;font-size:13px;color:#64748b;text-align:center;">View, print, or save from your browser:</p>
    <p style="margin:0 0 16px 0;font-size:13px;text-align:center;">
      <a href="${escapeHtml(opts.payUrl)}" style="color:${b.accentColor};font-weight:600;text-decoration:underline;">Open invoice page</a>
    </p>
    <p style="margin:0;font-size:13px;color:#64748b;">Or copy this link:<br /><span style="word-break:break-all;color:#0f172a;">${escapeHtml(opts.payUrl)}</span></p>
  `;
  return {
    subject: `Invoice #${opts.invoiceNumber} — ${opts.amountLabel}`,
    html: layout(inner, b),
  };
}

export function buildInvoiceReminderEmail(opts: {
  customerName: string;
  invoiceNumber: string;
  amountLabel: string;
  dueLabel: string | null;
  payUrl: string;
  branding?: Partial<InvoiceEmailBranding>;
  invoiceDocument?: {
    currency: string;
    totalCents: number;
    issuedDateLabel: string | null;
    billToName: string;
    billToEmail: string | null;
    lines: InvoiceLineNormalized[];
    notesPreview: string | null;
  };
}) {
  const b = { ...defaultBranding, ...opts.branding };
  const doc =
    opts.invoiceDocument &&
    buildInvoiceEmailDocumentSection({
      branding: b,
      invoiceNumber: opts.invoiceNumber,
      currency: opts.invoiceDocument.currency,
      totalCents: opts.invoiceDocument.totalCents,
      issuedDateLabel: opts.invoiceDocument.issuedDateLabel,
      dueDateLabel: opts.dueLabel,
      billToName: opts.invoiceDocument.billToName,
      billToEmail: opts.invoiceDocument.billToEmail,
      lines: opts.invoiceDocument.lines,
      notesPreview: opts.invoiceDocument.notesPreview,
    });
  const inner = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(opts.customerName)},</p>
    <p style="margin:0 0 16px 0;">This is a reminder that invoice <strong>#${escapeHtml(opts.invoiceNumber)}</strong> (${escapeHtml(
      opts.amountLabel
    )}) is still outstanding.</p>
    ${doc ?? ""}
    <p style="margin:24px 0 16px 0;text-align:center;">
      <a href="${escapeHtml(opts.payUrl)}" style="display:inline-block;padding:14px 28px;background:${b.accentColor};color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:15px;">Pay now</a>
    </p>
    <p style="margin:0 0 12px 0;font-size:13px;color:#64748b;text-align:center;">View, print, or save from your browser:</p>
    <p style="margin:0 0 16px 0;font-size:13px;text-align:center;">
      <a href="${escapeHtml(opts.payUrl)}" style="color:${b.accentColor};font-weight:600;text-decoration:underline;">Open invoice page</a>
    </p>
    <p style="margin:0;font-size:13px;color:#64748b;">If you already paid, thank you — you can disregard this email.</p>
  `;
  return {
    subject: `Reminder: Invoice #${opts.invoiceNumber}`,
    html: layout(inner, b),
  };
}
