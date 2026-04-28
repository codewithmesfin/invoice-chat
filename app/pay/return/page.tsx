import Link from "next/link";
import { syncInvoiceFromCheckoutReturn } from "@/lib/stripe/sync-checkout-return";

export const dynamic = "force-dynamic";

export default async function PayReturnPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const sessionId = typeof searchParams.session_id === "string" ? searchParams.session_id : "";

  let headline = "Thank you";
  let detail =
    "If you completed checkout, your payment is processing. The business updates the invoice when you return from Stripe.";

  if (sessionId) {
    const sync = await syncInvoiceFromCheckoutReturn(sessionId);
    headline = sync.headline;
    detail = sync.detail;
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-emerald-50 text-2xl">
          ✓
        </div>
        <h1 className="text-lg font-semibold text-slate-900">{headline}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{detail}</p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Done
        </Link>
      </div>
    </div>
  );
}
