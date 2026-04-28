"use client";

import { useState } from "react";
import type { PublicPayInvoiceView } from "@/lib/pay/public-invoice-by-token";
import { Button } from "@/components/ui/button";

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

type Props = {
  token: string;
  cancelled: boolean;
  view: PublicPayInvoiceView;
  state: "open" | "paid" | "cancelled_invoice" | "too_small";
};

export function PayInvoiceClient({ token, cancelled, view, state }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      {cancelled ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Checkout was cancelled. You can pay below when you are ready.
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">Invoice</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">#{view.number}</h1>

        <div className="mt-6 space-y-3 text-sm text-slate-700">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3">
            <span className="text-slate-500">Amount due</span>
            <span className="text-xl font-semibold text-slate-900">
              {formatMoney(view.total_cents, view.currency)}
            </span>
          </div>
          {view.customer_name ? (
            <div className="flex justify-between gap-4 pt-1">
              <span className="text-slate-500">Bill to</span>
              <span className="text-right font-medium text-slate-900">{view.customer_name}</span>
            </div>
          ) : null}
          {view.due_date ? (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Due date</span>
              <span className="font-medium text-slate-900">{view.due_date}</span>
            </div>
          ) : null}
          {view.notes_preview ? (
            <div className="pt-2">
              <p className="text-xs font-medium uppercase text-slate-400">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                {view.notes_preview}
              </p>
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {state === "open" ? (
          <div className="mt-8 space-y-3">
            <Button
              type="button"
              className="h-12 w-full rounded-xl text-base font-semibold"
              disabled={loading}
              onClick={() => void startCheckout()}
            >
              {loading ? "Redirecting to secure checkout…" : "Pay with card"}
            </Button>
            <p className="text-center text-xs text-slate-500">
              You will complete payment on Stripe. We never store your card on this site.
            </p>
          </div>
        ) : null}

        {state === "paid" ? (
          <p className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-900">
            This invoice is already marked paid. Thank you.
          </p>
        ) : null}

        {state === "cancelled_invoice" ? (
          <p className="mt-8 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-700">
            This invoice is cancelled and does not accept payment.
          </p>
        ) : null}

        {state === "too_small" ? (
          <p className="mt-8 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-700">
            This balance is below the minimum for online card payment ($0.50). Please contact the business to pay
            another way.
          </p>
        ) : null}
      </div>
    </div>
  );
}
