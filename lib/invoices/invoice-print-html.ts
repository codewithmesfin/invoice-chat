import type { InvoiceLineNormalized } from "@/lib/invoices/invoice-lines";
import { INVOICE_PRINT } from "@/lib/invoices/invoice-print-theme";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function formatQty(q: number) {
  if (Number.isInteger(q)) return String(q);
  return String(q);
}

function padLineNo(i: number) {
  return String(i).padStart(2, "0");
}

export type StandaloneInvoiceHtmlOpts = {
  fromName: string;
  invoiceNumber: string;
  currency: string;
  totalCents: number;
  issuedDateLabel: string | null;
  dueDateLabel: string | null;
  billToName: string | null;
  billToEmail: string | null;
  notes: string | null;
  lines: InvoiceLineNormalized[];
};

/** Standalone HTML download — matches on-screen print template. */
export function buildStandaloneInvoiceHtml(opts: StandaloneInvoiceHtmlOpts): string {
  const p = INVOICE_PRINT;
  const subtotalCents = opts.lines.reduce((s, l) => s + l.lineTotalCents, 0);

  const rows = opts.lines
    .map(
      (line, idx) =>
        `<tr>
          <td style="padding:12px 10px;border-bottom:1px solid ${p.border};font-size:14px;color:${p.ink};vertical-align:top;">${escapeHtml(padLineNo(idx + 1))}</td>
          <td style="padding:12px 10px;border-bottom:1px solid ${p.border};font-size:14px;color:${p.ink};">${escapeHtml(line.description)}</td>
          <td style="padding:12px 10px;border-bottom:1px solid ${p.border};font-size:14px;color:${p.ink};text-align:right;white-space:nowrap;">${escapeHtml(formatQty(line.quantity))}</td>
          <td style="padding:12px 10px;border-bottom:1px solid ${p.border};font-size:14px;color:${p.ink};text-align:right;font-weight:600;white-space:nowrap;">${escapeHtml(formatMoney(line.lineTotalCents, opts.currency))}</td>
        </tr>`
    )
    .join("");

  const prepared =
    [opts.billToName, opts.billToEmail].filter(Boolean).length > 0
      ? `<div style="margin-top:6px;font-size:15px;font-weight:600;color:${p.ink};line-height:1.5;">
           ${opts.billToName ? escapeHtml(opts.billToName) : ""}
           ${opts.billToName && opts.billToEmail ? "<br/>" : ""}
           ${opts.billToEmail ? `<span style="font-weight:500;color:#64748b;font-size:14px;">${escapeHtml(opts.billToEmail)}</span>` : ""}
         </div>`
      : `<span style="color:${p.label};">—</span>`;

  const dateIssued = opts.issuedDateLabel ? escapeHtml(opts.issuedDateLabel) : "—";
  const dueDate = opts.dueDateLabel ? escapeHtml(opts.dueDateLabel) : "—";

  const termsBlock = opts.notes
    ? `<div style="margin-top:32px;padding-top:20px;border-top:1px solid ${p.border};max-width:62%;">
         <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:${p.label};text-transform:uppercase;">Terms and condition</div>
         <div style="margin-top:10px;font-size:12px;line-height:1.65;color:#64748b;white-space:pre-wrap;">${escapeHtml(opts.notes)}</div>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Invoice #${escapeHtml(opts.invoiceNumber)}</title>
  <style>
    @media print {
      body { background: #fff !important; padding: 0 !important; }
      .sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; border-radius: 0 !important; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body style="margin:0;background:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${p.ink};padding:24px 16px;">
  <p class="no-print" style="margin:0 0 16px 0;font-size:13px;color:#64748b;">Use <strong>Print</strong> to print or save as PDF.</p>
  <div class="sheet" style="max-width:800px;margin:0 auto;background:#ffffff;border:1px solid ${p.border};border-radius:4px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
    <div style="height:14px;background:${p.topBar};"></div>
    <div style="padding:36px 40px 8px 40px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td style="vertical-align:top;width:55%;">
            <div style="font-size:0;line-height:0;">
              <span style="display:inline-block;width:11px;height:11px;background:${p.ink};margin-right:5px;vertical-align:middle;"></span>
              <span style="display:inline-block;width:11px;height:11px;background:${p.ink};margin-right:5px;vertical-align:middle;"></span>
              <span style="display:inline-block;width:11px;height:11px;background:${p.ink};vertical-align:middle;"></span>
            </div>
            <div style="margin-top:16px;font-size:13px;color:#64748b;font-weight:600;">${escapeHtml(opts.fromName)}</div>
          </td>
          <td style="vertical-align:top;text-align:right;">
            <div style="font-size:28px;font-weight:800;letter-spacing:-0.02em;color:${p.ink};line-height:1.1;">INVOICE</div>
            <div style="font-size:28px;font-weight:800;letter-spacing:-0.02em;color:${p.ink};margin-top:2px;">#${escapeHtml(opts.invoiceNumber)}</div>
          </td>
        </tr>
      </table>
    </div>

    <div style="padding:8px 40px 28px 40px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td style="vertical-align:top;width:33%;padding-right:12px;">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;color:${p.label};text-transform:uppercase;">Prepared for:</div>
            ${prepared}
          </td>
          <td style="vertical-align:top;width:33%;padding:0 12px;">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;color:${p.label};text-transform:uppercase;">Date issued:</div>
            <div style="margin-top:6px;font-size:15px;font-weight:600;color:${p.ink};">${dateIssued}</div>
          </td>
          <td style="vertical-align:top;width:34%;padding-left:12px;">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;color:${p.label};text-transform:uppercase;">Due date:</div>
            <div style="margin-top:6px;font-size:15px;font-weight:600;color:${p.ink};">${dueDate}</div>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:28px;border-collapse:collapse;">
        <thead>
          <tr>
            <th align="left" style="width:48px;padding:10px 10px 10px 0;border-bottom:1px solid #cbd5e1;font-size:10px;font-weight:700;letter-spacing:0.08em;color:${p.label};text-transform:uppercase;">No</th>
            <th align="left" style="padding:10px 10px;border-bottom:1px solid #cbd5e1;font-size:10px;font-weight:700;letter-spacing:0.08em;color:${p.label};text-transform:uppercase;">Item description</th>
            <th align="right" style="padding:10px 10px;border-bottom:1px solid #cbd5e1;font-size:10px;font-weight:700;letter-spacing:0.08em;color:${p.label};text-transform:uppercase;">Quantity</th>
            <th align="right" style="padding:10px 0 10px 10px;border-bottom:1px solid #cbd5e1;font-size:10px;font-weight:700;letter-spacing:0.08em;color:${p.label};text-transform:uppercase;">Cost</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px;">
        <tr>
          <td align="right" style="padding:20px 0 0 0;">
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin-left:auto;min-width:260px;">
              <tr>
                <td style="padding:6px 16px 6px 0;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Sub total:</td>
                <td style="padding:6px 0;font-size:15px;font-weight:600;color:${p.ink};text-align:right;white-space:nowrap;">${escapeHtml(formatMoney(subtotalCents, opts.currency))}</td>
              </tr>
              <tr>
                <td colspan="2" style="border-top:1px solid ${p.border};padding:0;height:12px;"></td>
              </tr>
              <tr>
                <td style="padding:8px 16px 0 0;font-size:14px;font-weight:800;color:${p.accent};text-transform:uppercase;letter-spacing:0.06em;">Total:</td>
                <td style="padding:8px 0 0 0;font-size:20px;font-weight:800;color:${p.accent};text-align:right;white-space:nowrap;">${escapeHtml(formatMoney(opts.totalCents, opts.currency))}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:36px;">
        <tr>
          <td style="vertical-align:bottom;width:58%;">${termsBlock}</td>
          <td style="vertical-align:bottom;text-align:right;padding-left:24px;">
            <div style="border-bottom:1px solid ${p.ink};min-width:200px;margin-left:auto;margin-bottom:8px;height:1px;"></div>
            <div style="font-size:13px;font-weight:700;color:${p.ink};">${escapeHtml(opts.fromName)}</div>
            <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;color:#64748b;text-transform:uppercase;margin-top:4px;">Authorized signature</div>
          </td>
        </tr>
      </table>
    </div>
  </div>
</body>
</html>`;
}
