import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildInvoiceReminderEmail } from "@/lib/email/invoice-templates";
import { getEmailFrom, sendTransactionalEmail } from "@/lib/email/smtp";
import { normalizeInvoiceLines } from "@/lib/invoices/invoice-lines";
import { assertAppUrl } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function formatIssuedDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function notesPreview(notes: string | null | undefined): string | null {
  const n = notes?.trim();
  if (!n) return null;
  return n.length > 400 ? `${n.slice(0, 400)}…` : n;
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
      "id,user_id,number,reminder_count,last_reminder_sent_at,payment_share_token,total_cents,currency,due_date,status,payment_status,created_at,notes,customers(email,name)"
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

    const { data: lineRows } = await admin
      .from("invoice_line_items")
      .select("description,quantity,unit_amount_cents,sort_order")
      .eq("invoice_id", inv.id)
      .order("sort_order", { ascending: true });

    const normalizedLines = normalizeInvoiceLines(lineRows ?? [], {
      totalCents: inv.total_cents as number,
    });

    const email = buildInvoiceReminderEmail({
      customerName,
      invoiceNumber: String(inv.number),
      amountLabel,
      dueLabel,
      payUrl,
      invoiceDocument: {
        currency: (inv.currency as string) || "USD",
        totalCents: inv.total_cents as number,
        issuedDateLabel: formatIssuedDateLabel(inv.created_at as string | null),
        billToName: customerName,
        billToEmail: c.email.trim(),
        lines: normalizedLines,
        notesPreview: notesPreview(inv.notes as string | null),
      },
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
