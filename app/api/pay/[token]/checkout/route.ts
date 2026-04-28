import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchInvoiceByPayToken } from "@/lib/pay/public-invoice-by-token";
import { assertAppUrl, getStripe } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const token = params.token?.trim() ?? "";
  const lookup = await fetchInvoiceByPayToken(token);
  if (!lookup.ok) {
    const status =
      lookup.reason === "invalid"
        ? 400
        : lookup.reason === "notfound"
          ? 404
          : 503;
    return NextResponse.json(
      { error: lookup.reason, message: lookup.detail },
      { status }
    );
  }

  const row = lookup.invoice;

  if (row.status === "paid" || row.status === "cancelled") {
    return NextResponse.json({ error: "closed" }, { status: 409 });
  }

  if (row.total_cents < 50) {
    return NextResponse.json({ error: "amount" }, { status: 400 });
  }

  let stripe: ReturnType<typeof getStripe>;
  let appBase: string;
  try {
    stripe = getStripe();
    appBase = assertAppUrl(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Stripe not configured";
    return NextResponse.json({ error: "stripe_config", message: msg }, { status: 503 });
  }

  const customerEmail = row.customers?.email ?? undefined;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(customerEmail ? { customer_email: customerEmail } : {}),
    line_items: [
      {
        price_data: {
          currency: (row.currency || "USD").toLowerCase(),
          unit_amount: row.total_cents,
          product_data: {
            name: `Invoice ${row.number}`,
            description: `Secure payment for invoice #${row.number}`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${appBase}/pay/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appBase}/pay/${encodeURIComponent(token)}?cancelled=1`,
    metadata: {
      invoice_id: row.id,
      user_id: row.user_id,
    },
    payment_intent_data: {
      metadata: { invoice_id: row.id, user_id: row.user_id },
    },
  });

  const admin = createAdminClient();
  await admin
    .from("invoices")
    .update({
      stripe_checkout_session_id: session.id,
      payment_status: "pending_checkout",
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (!session.url) {
    return NextResponse.json({ error: "session" }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
}
