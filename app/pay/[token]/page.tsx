import Link from "next/link";
import { fetchInvoiceByPayToken } from "@/lib/pay/public-invoice-by-token";
import { PayInvoiceClient } from "@/components/pay/pay-invoice-client";

export const dynamic = "force-dynamic";

export default async function PayInvoicePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const token = params.token?.trim() ?? "";
  const cancelled = searchParams.cancelled === "1" || searchParams.cancelled === "true";

  const lookup = await fetchInvoiceByPayToken(token);

  if (!lookup.ok) {
    const reason = lookup.reason;
    const body =
      reason === "invalid"
        ? "This payment link is not valid (token too short or malformed)."
        : reason === "notfound"
          ? "We could not find an invoice for this link. It may have been replaced, or the link was copied incorrectly."
          : reason === "missing_service_role"
            ? "Public pay pages need SUPABASE_SERVICE_ROLE_KEY in the server environment. Add it from Supabase → Project Settings → API → service_role (secret), restart the dev server, then open the link again. This key is server-only and must never be exposed in the browser."
            : reason === "supabase_public_env"
              ? "Supabase URL or anon key is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example)."
              : lookup.detail
                ? `Server configuration error: ${lookup.detail}`
                : "Server configuration error. Check Supabase env vars and restart.";

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Link not available</h1>
          <p className="mt-3 text-left text-sm leading-relaxed text-slate-600">{body}</p>
          {reason === "missing_service_role" ? (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-left font-mono text-xs text-slate-700">
              SUPABASE_SERVICE_ROLE_KEY=eyJ...
            </p>
          ) : null}
          <Link
            href="/"
            className="mt-8 inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Home
          </Link>
        </div>
      </div>
    );
  }

  const { view } = lookup;
  const inv = lookup.invoice;

  let state: "open" | "paid" | "cancelled_invoice" | "too_small" = "open";
  if (inv.status === "paid") state = "paid";
  else if (inv.status === "cancelled") state = "cancelled_invoice";
  else if (inv.total_cents < 50) state = "too_small";

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-50 to-slate-100/80">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <span className="text-sm font-semibold text-slate-800">Secure pay</span>
          <Link href="/" className="text-sm font-medium text-sky-700 hover:text-sky-800">
            Home
          </Link>
        </div>
      </header>

      <PayInvoiceClient token={lookup.token} cancelled={cancelled} view={view} state={state} />
    </div>
  );
}
