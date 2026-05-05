"use client";

import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import type { PublicPayInvoiceView } from "@/lib/pay/public-invoice-by-token";
import type { InvoiceLineNormalized } from "@/lib/invoices/invoice-lines";
import { buildStandaloneInvoiceHtml } from "@/lib/invoices/invoice-print-html";
import { INVOICE_PRINT as T } from "@/lib/invoices/invoice-print-theme";
import { Button } from "@/components/ui/button";

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

function formatDueLabel(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function padLineNo(i: number) {
  return String(i).padStart(2, "0");
}

type Props = {
  token: string;
  cancelled: boolean;
  view: PublicPayInvoiceView;
  state: "open" | "paid" | "cancelled_invoice" | "too_small";
  issuerName?: string;
};

export function PayInvoiceClient({
  token,
  cancelled,
  view,
  state,
  issuerName = "Invoice",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linesNorm: InvoiceLineNormalized[] = view.lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitAmountCents: l.unit_amount_cents,
    lineTotalCents: l.line_total_cents,
  }));

  const subtotalCents = useMemo(
    () => view.lines.reduce((sum, line) => sum + line.line_total_cents, 0),
    [view.lines]
  );

  function downloadHtmlInvoice() {
    const html = buildStandaloneInvoiceHtml({
      fromName: issuerName,
      invoiceNumber: view.number,
      currency: view.currency,
      totalCents: view.total_cents,
      issuedDateLabel: view.issued_at_label,
      dueDateLabel: formatDueLabel(view.due_date),
      billToName: view.customer_name,
      billToEmail: view.customer_email,
      notes: view.notes_preview,
      lines: linesNorm,
    });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-${view.number.replace(/[^\w.-]+/g, "_")}.html`;
    a.rel = "noopener";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pay/${encodeURIComponent(token)}/checkout`, {
        method: "POST",
      });
      const data = (await res.json()) as { url?: string; error?: string; message?: string };
      if (!res.ok) {
        if (data.error === "closed") {
          setError("This invoice is already paid or closed.");
        } else if (data.error === "amount") {
          setError("This amount is too small for card checkout.");
        } else if (data.error === "stripe_config") {
          setError(data.message ?? "Stripe is not configured (check STRIPE_SECRET_KEY and NEXT_PUBLIC_APP_URL).");
        } else if (data.error === "missing_service_role" || data.error === "supabase_public_env") {
          setError(
            data.message ??
              "Server is missing Supabase configuration. The business owner must set SUPABASE_SERVICE_ROLE_KEY and restart the app."
          );
        } else {
          setError(data.message ?? "Could not start checkout. Try again.");
        }
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError("No checkout URL returned.");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const dueDisplay = formatDueLabel(view.due_date);
  const issuedDisplay = view.issued_at_label ?? "—";
  const dueCol = dueDisplay ?? "—";

  const preparedName = view.customer_name?.trim();
  const preparedEmail = view.customer_email?.trim();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 print:py-4">
      {cancelled ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
          Checkout was cancelled. You can pay below when you are ready.
        </div>
      ) : null}

      {error ? (
        <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 print:hidden">
          {error}
        </p>
      ) : null}

      <article className="invoice-sheet overflow-hidden rounded border border-slate-200/90 bg-white shadow-sm print:border-slate-300 print:shadow-none">
        <div className="h-3.5 w-full print:h-3" style={{ background: T.topBar }} />

        <div className="px-6 pb-2 pt-8 sm:px-10 sm:pt-10">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="flex gap-1.5" aria-hidden>
                <span className="size-2.5 rounded-sm" style={{ background: T.ink }} />
                <span className="size-2.5 rounded-sm" style={{ background: T.ink }} aria-hidden />
                <span className="size-2.5 rounded-sm" style={{ background: T.ink }} aria-hidden />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-800">{issuerName}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold leading-none tracking-tight text-slate-900 sm:text-3xl">INVOICE</p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">#{view.number}</p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-8 pt-2 sm:px-10 sm:pb-10">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: T.label }}>
                Prepared for:
              </p>
              {preparedName || preparedEmail ? (
                <div className="mt-2 text-[15px] font-semibold leading-snug text-slate-900">
                  {preparedName ? <p>{preparedName}</p> : null}
                  {preparedEmail ? (
                    <p className="mt-0.5 text-sm font-medium" style={{ color: T.muted }}>
                      {preparedEmail}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-sm" style={{ color: T.label }}>
                  —
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: T.label }}>
                Date issued:
              </p>
              <p className="mt-2 text-[15px] font-semibold text-slate-900">{issuedDisplay}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: T.label }}>
                Due date:
              </p>
              <p className="mt-2 text-[15px] font-semibold text-slate-900">{dueCol}</p>
            </div>
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300">
                  <th
                    className="w-12 py-2.5 pl-0 pr-2 text-left text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: T.label }}
                  >
                    No
                  </th>
                  <th
                    className="py-2.5 pl-2 pr-2 text-left text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: T.label }}
                  >
                    Item description
                  </th>
                  <th
                    className="py-2.5 px-2 text-right text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: T.label }}
                  >
                    Quantity
                  </th>
                  <th
                    className="py-2.5 pl-2 pr-0 text-right text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: T.label }}
                  >
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.lines.map((line, i) => (
                  <tr key={i} className="border-b" style={{ borderColor: T.border }}>
                    <td className="py-3 pl-0 pr-2 align-top text-slate-900 tabular-nums">{padLineNo(i + 1)}</td>
                    <td className="py-3 px-2 align-top text-slate-900">{line.description}</td>
                    <td className="py-3 px-2 text-right align-top tabular-nums text-slate-800">
                      {formatQty(line.quantity)}
                    </td>
                    <td className="py-3 pl-2 pr-0 text-right align-top text-base font-semibold tabular-nums text-slate-900">
                      {formatMoney(line.line_total_cents, view.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-[280px] space-y-1">
              <div className="flex justify-between gap-4 text-sm">
                <span className="uppercase tracking-wide" style={{ color: T.muted }}>
                  Sub total:
                </span>
                <span className="font-semibold tabular-nums text-slate-900">
                  {formatMoney(subtotalCents, view.currency)}
                </span>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <div className="flex justify-between gap-4">
                  <span className="text-sm font-extrabold uppercase tracking-wide" style={{ color: T.accent }}>
                    Total:
                  </span>
                  <span className="text-xl font-extrabold tabular-nums sm:text-2xl" style={{ color: T.accent }}>
                    {formatMoney(view.total_cents, view.currency)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-10 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
            {view.notes_preview ? (
              <div className="max-w-xl flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: T.label }}>
                  Terms and condition
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{view.notes_preview}</p>
              </div>
            ) : (
              <div className="flex-1 print:block" aria-hidden />
            )}
            <div className="shrink-0 text-right sm:min-w-[220px]">
              <div className="ml-auto border-b border-slate-900 pb-1" style={{ maxWidth: 220 }} />
              <p className="mt-3 text-sm font-bold text-slate-900">{issuerName}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: T.label }}>
                Authorized signature
              </p>
            </div>
          </div>
        </div>

        <footer className="print:hidden border-t border-slate-100 bg-slate-50/80 px-6 py-5 sm:px-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2 rounded-xl"
                onClick={() => window.print()}
              >
                <Printer className="size-4" aria-hidden />
                Print
              </Button>
              <Button type="button" variant="outline" className="gap-2 rounded-xl" onClick={downloadHtmlInvoice}>
                <Download className="size-4" aria-hidden />
                Download
              </Button>
            </div>

            {state === "open" ? (
              <Button
                type="button"
                className="h-12 min-w-[200px] rounded-xl text-base font-semibold sm:ml-auto"
                disabled={loading}
                onClick={() => void startCheckout()}
              >
                {loading ? "Redirecting to secure checkout…" : "Pay with card"}
              </Button>
            ) : null}
          </div>
          {state === "open" ? (
            <p className="mt-4 text-center text-xs text-slate-600 sm:text-left">
              You will complete payment on Stripe. Card details are not stored on this site.
            </p>
          ) : null}

          {state === "paid" ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-900">
              This invoice is already marked paid. Thank you.
            </p>
          ) : null}

          {state === "cancelled_invoice" ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-700">
              This invoice is cancelled and does not accept payment.
            </p>
          ) : null}

          {state === "too_small" ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-700">
              This balance is below the minimum for online card payment ($0.50). Please contact the business to pay
              another way.
            </p>
          ) : null}
        </footer>
      </article>
    </div>
  );
}
