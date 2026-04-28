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

export function buildInvoiceLinkEmail(opts: {
  customerName: string;
  invoiceNumber: string;
  amountLabel: string;
  dueLabel: string | null;
  payUrl: string;
  branding?: Partial<InvoiceEmailBranding>;
}) {
  const b = { ...defaultBranding, ...opts.branding };
  const due = opts.dueLabel
    ? `<p style="margin:12px 0 0 0;"><strong>Due:</strong> ${escapeHtml(opts.dueLabel)}</p>`
    : "";
  const inner = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(opts.customerName)},</p>
    <p style="margin:0 0 16px 0;">You have a new invoice <strong>#${escapeHtml(opts.invoiceNumber)}</strong> for <strong>${escapeHtml(opts.amountLabel)}</strong>.</p>
    ${due}
    <p style="margin:24px 0 16px 0;text-align:center;">
      <a href="${escapeHtml(opts.payUrl)}" style="display:inline-block;padding:14px 28px;background:${b.accentColor};color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:15px;">Pay securely</a>
    </p>
    <p style="margin:0;font-size:13px;color:#64748b;">Or copy this link into your browser:<br /><span style="word-break:break-all;color:#0f172a;">${escapeHtml(opts.payUrl)}</span></p>
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
}) {
  const b = { ...defaultBranding, ...opts.branding };
  const due = opts.dueLabel
    ? `<p style="margin:12px 0 0 0;"><strong>Due:</strong> ${escapeHtml(opts.dueLabel)}</p>`
    : "";
  const inner = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(opts.customerName)},</p>
    <p style="margin:0 0 16px 0;">This is a friendly reminder that invoice <strong>#${escapeHtml(opts.invoiceNumber)}</strong> for <strong>${escapeHtml(opts.amountLabel)}</strong> is still outstanding.</p>
    ${due}
    <p style="margin:24px 0 16px 0;text-align:center;">
      <a href="${escapeHtml(opts.payUrl)}" style="display:inline-block;padding:14px 28px;background:${b.accentColor};color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:15px;">Pay now</a>
    </p>
    <p style="margin:0;font-size:13px;color:#64748b;">If you already paid, thank you — you can disregard this email.</p>
  `;
  return {
    subject: `Reminder: Invoice #${opts.invoiceNumber}`,
    html: layout(inner, b),
  };
}
