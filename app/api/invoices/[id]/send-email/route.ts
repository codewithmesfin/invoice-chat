import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertAppUrl } from "@/lib/stripe/server";
import { getEmailFrom } from "@/lib/email/smtp";
import { deliverInvoiceLinkEmail } from "@/lib/invoices/deliver-invoice-link-email";
import { syncCustomerEmbedding, syncInvoiceEmbedding } from "@/lib/embeddings/sync-entity";

const BodySchema = z.object({
  kind: z.enum(["invoice_link", "reminder"]).default("invoice_link"),
  customer_name: z.string().max(200).optional(),
  customer_email: z.string().max(255).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      json = await req.json();
    }
  } catch {
    /* empty body */
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const kind = parsed.data.kind;
  const nameTrim = parsed.data.customer_name?.trim() || undefined;
  const emailTrim = parsed.data.customer_email?.trim() || undefined;
  if (emailTrim && !z.string().email().safeParse(emailTrim).success) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  try {
    getEmailFrom();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Email not configured";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  let appBase: string;
  try {
    appBase = assertAppUrl();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "App URL not configured";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const { data: inv, error } = await supabase
    .from("invoices")
    .select(
      "id,number,status,payment_share_token,total_cents,currency,due_date,reminder_count,customer_id,customers(name,email)"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rawCust = inv.customers as unknown;
  const customerRow = (Array.isArray(rawCust) ? rawCust[0] : rawCust) as {
    name: string | null;
    email: string | null;
  } | null;
  const customerId = inv.customer_id as string | null;

  if (customerId && !customerRow) {
    return NextResponse.json(
      {
        error: "LINKED_CLIENT_MISSING",
        message: "This invoice points to a client that no longer exists. Edit the invoice and pick a client.",
      },
      { status: 400 }
    );
  }

  const missing: ("name" | "email")[] = [];
  if (!customerId) {
    if (!nameTrim) missing.push("name");
    if (!emailTrim) missing.push("email");
  } else {
    if (!customerRow!.email?.trim() && !emailTrim) missing.push("email");
    if (!customerRow!.name?.trim() && !nameTrim) missing.push("name");
  }

  if (missing.length) {
    const message =
      missing.length === 2
        ? "Add the client’s name and email so we can send this message."
        : missing[0] === "email"
          ? "Add the client’s email so we can send this message."
          : "Add the client’s name so the email is addressed correctly.";
    return NextResponse.json(
      {
        error: "CUSTOMER_DETAILS_REQUIRED",
        message,
        missing,
      },
      { status: 422 }
    );
  }

  if (inv.status === "paid" || inv.status === "cancelled") {
    return NextResponse.json({ error: "Cannot email payment link for this invoice state." }, { status: 400 });
  }

  if (inv.total_cents < 50) {
    return NextResponse.json(
      { error: "Invoice total must be at least $0.50 to use online checkout." },
      { status: 400 }
    );
  }

  let customer = customerRow;
  let toEmail: string;

  if (!customerId) {
    const { data: newCust, error: insErr } = await supabase
      .from("customers")
      .insert({
        user_id: user.id,
        name: nameTrim!,
        email: emailTrim!,
        notes: null,
      })
      .select("id,name,email")
      .single();

    if (insErr || !newCust) {
      return NextResponse.json({ error: insErr?.message ?? "Could not create client." }, { status: 500 });
    }

    const { error: linkErr } = await supabase
      .from("invoices")
      .update({ customer_id: newCust.id, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    if (linkErr) {
      return NextResponse.json({ error: linkErr.message }, { status: 500 });
    }

    customer = { name: newCust.name, email: newCust.email };
    toEmail = emailTrim!;

    try {
      await syncCustomerEmbedding(supabase, user.id, newCust.id);
    } catch {
      /* best-effort */
    }
    try {
      await syncInvoiceEmbedding(supabase, user.id, id);
    } catch {
      /* best-effort */
    }
  } else {
    const patch: { name?: string; email?: string; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };
    if (nameTrim) patch.name = nameTrim;
    if (emailTrim) patch.email = emailTrim;

    const hasFieldPatch = patch.name !== undefined || patch.email !== undefined;
    if (hasFieldPatch) {
      const { error: upErr } = await supabase
        .from("customers")
        .update(patch)
        .eq("id", customerId)
        .eq("user_id", user.id);

      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

      try {
        await syncCustomerEmbedding(supabase, user.id, customerId);
      } catch {
        /* best-effort */
      }
      try {
        await syncInvoiceEmbedding(supabase, user.id, id);
      } catch {
        /* best-effort */
      }
    }

    const resolvedEmail = (emailTrim ?? customerRow!.email)?.trim();
    if (!resolvedEmail) {
      return NextResponse.json({ error: "No recipient email after update." }, { status: 500 });
    }
    toEmail = resolvedEmail;
    customer = {
      name: (nameTrim ?? customerRow!.name)?.trim() || null,
      email: resolvedEmail,
    };
  }

  const customerName = customer?.name?.trim() || "there";

  const sent = await deliverInvoiceLinkEmail({
    supabase,
    userId: user.id,
    invoiceId: id,
    kind,
    appBase,
    inv: {
      number: inv.number,
      total_cents: inv.total_cents as number,
      currency: inv.currency as string | null,
      due_date: inv.due_date as string | null,
      payment_share_token: inv.payment_share_token as string | null,
      reminder_count: inv.reminder_count as number | null,
    },
    customerName,
    toEmail,
  });

  if (!sent.ok) {
    return NextResponse.json({ error: sent.error }, { status: 502 });
  }

  if (sent.logWarning) {
    return NextResponse.json(
      { sent: true, warning: sent.logWarning, id: sent.messageId },
      { status: 201 }
    );
  }

  return NextResponse.json({ sent: true, id: sent.messageId, payUrl: sent.payUrl });
}
