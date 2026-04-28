import Link from "next/link";

const reasons: Record<string, string> = {
  invalid: "This payment link is not valid.",
  notfound: "We could not find an invoice for this link. It may have been revoked.",
  closed: "This invoice is already paid or no longer accepts payments.",
  amount: "This invoice total is below the minimum amount we can charge online.",
  session: "We could not start the checkout session. Please try again in a moment.",
  config: "Payments are not configured on this server.",
};

export default function PayErrorPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const r = typeof searchParams.reason === "string" ? searchParams.reason : "";
  const message = reasons[r] ?? "Something went wrong with this payment link.";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Payment unavailable</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{message}</p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
