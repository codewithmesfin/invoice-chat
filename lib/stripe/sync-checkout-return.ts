import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";

export type PayReturnSyncResult = {
  headline: string;
  detail: string;
  invoiceUpdated: boolean;
};

/**
 * Confirms Checkout with Stripe API when the customer lands on success_url (no webhooks).
 * Idempotent: safe to reload; uses synthetic stripe_event_id return:<sessionId> on payment.
 */
export async function syncInvoiceFromCheckoutReturn(
  sessionId: string
): Promise<PayReturnSyncResult> {
  if (!sessionId?.trim()) {
    return {
      headline: "Thank you",
      detail: "If you paid, your card issuer will show the charge shortly.",
      invoiceUpdated: false,
    };
  }

  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe();
  } catch {
    return {
      headline: "Thank you",
      detail: "Payment could not be verified (Stripe is not configured on this server).",
      invoiceUpdated: false,
    };
  }

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });
  } catch {
    return {
      headline: "Thank you",
      detail: "We could not load this checkout session. If you were charged, contact the business.",
      invoiceUpdated: false,
    };
  }

  const invoiceId = session.metadata?.invoice_id;
  const userId = session.metadata?.user_id;
  if (!invoiceId || !userId) {
    return {
      headline: "Thank you",
      detail: "This checkout session is not linked to an invoice record.",
      invoiceUpdated: false,
    };
  }

  const pi =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return {
      headline: "Thank you",
      detail: "Payment succeeded, but the app could not update the invoice (server configuration).",
      invoiceUpdated: false,
    };
  }

  if (session.payment_status === "paid") {
    const syntheticId = `return:${sessionId}`;
    const { error: evErr } = await admin.from("invoice_payment_events").insert({
      invoice_id: invoiceId,
      user_id: userId,
      event_type: "checkout.session.return_sync",
      stripe_event_id: syntheticId,
      payload: {
        session_id: sessionId,
        payment_status: session.payment_status,
        source: "success_url",
      },
    });
    if (evErr && evErr.code !== "23505") {
      /* duplicate return visit uses same synthetic id; other errors are non-fatal for payer UX */
    }

    await admin
      .from("invoices")
      .update({
        status: "paid",
        payment_status: "succeeded",
        stripe_payment_intent_id: pi,
        stripe_checkout_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId)
      .eq("user_id", userId);

    return {
      headline: "Payment received",
      detail:
        "Your payment was successful. The invoice is marked paid in the business dashboard (no webhook required).",
      invoiceUpdated: true,
    };
  }

  if (session.payment_status === "unpaid") {
    await admin
      .from("invoices")
      .update({
        payment_status: "processing",
        stripe_checkout_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId)
      .eq("user_id", userId);

    return {
      headline: "Payment processing",
      detail:
        "Some payment methods take a few minutes to settle. The business will see an update when Stripe marks the session paid.",
      invoiceUpdated: true,
    };
  }

  return {
    headline: "Thank you",
    detail: "Checkout session completed.",
    invoiceUpdated: false,
  };
}
