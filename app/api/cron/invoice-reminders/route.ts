import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildInvoiceReminderEmail } from "@/lib/email/invoice-templates";
import { getEmailFrom, sendTransactionalEmail } from "@/lib/email/smtp";
import { assertAppUrl } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  let appBase: string;
  try {
    admin = createAdminClient();
    getEmailFrom();
    appBase = assertAppUrl(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Config";
    return NextResponse.json({ skipped: true, reason: msg }, { status: 200 });
  }

  const { data: rows, error } = await admin
    .from("invoices")
    .select(
      "id,user_id,number,reminder_count,last_reminder_sent_at,payment_share_token,total_cents,currency,due_date,status,payment_status,customers(email,name)"
    )
    .in("status", ["sent", "overdue"])
    .neq("payment_status", "succeeded")
    .gte("total_cents", 50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const intervalMs = 7 * 24 * 60 * 60 * 1000;
  let sent = 0;

  for (const inv of rows ?? []) {
    const raw = inv.customers as unknown;
    const c = (Array.isArray(raw) ? raw[0] : raw) as
      | { email: string | null; name: string | null }
      | null
      | undefined;
    if (!c?.email?.trim()) continue;
    if ((inv.reminder_count ?? 0) >= 5) continue;
    const last = inv.last_reminder_sent_at
      ? new Date(inv.last_reminder_sent_at as string).getTime()
      : 0;
    if (last && now - last < intervalMs) continue;

    let token = inv.payment_share_token as string | null;
    if (!token) {
      token = randomBytes(24).toString("hex");
      await admin
        .from("invoices")
        .update({ payment_share_token: token, updated_at: new Date().toISOString() })
        .eq("id", inv.id);
    }

    const payUrl = `${appBase}/pay/${token}`;
    const amountLabel = formatMoney(inv.total_cents as number, (inv.currency as string) || "USD");
    const dueLabel = inv.due_date ? String(inv.due_date) : null;
    const customerName = c.name?.trim() || "there";

    const email = buildInvoiceReminderEmail({
      customerName,
      invoiceNumber: String(inv.number),
      amountLabel,
      dueLabel,
      payUrl,
    });

    let sendData: { messageId: string | undefined };
    try {
      sendData = await sendTransactionalEmail({
        to: c.email.trim(),
        subject: email.subject,
        html: email.html,
      });
    } catch {
      continue;
    }

    await admin.from("invoice_email_events").insert({
      invoice_id: inv.id,
      user_id: inv.user_id,
      kind: "reminder",
      to_email: c.email.trim(),
      provider_message_id: sendData.messageId ?? null,
    });

    await admin
      .from("invoices")
      .update({
        last_reminder_sent_at: new Date().toISOString(),
        reminder_count: (Number(inv.reminder_count) || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inv.id);

    sent += 1;
  }

  return NextResponse.json({ sent, scanned: rows?.length ?? 0 });
}
