import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildInvoiceLinkEmail, buildInvoiceReminderEmail } from "@/lib/email/invoice-templates";
import { getEmailFrom, sendTransactionalEmail } from "@/lib/email/smtp";
import { normalizeInvoiceLines } from "@/lib/invoices/invoice-lines";
import { assertAppUrl } from "@/lib/stripe/server";

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

type InvoiceRow = {
  number: unknown;
  total_cents: number;
  currency: string | null;
  due_date: string | null;
  payment_share_token: string | null;
  reminder_count: number | null;
};

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

/**
 * Sends invoice_link or reminder email; ensures payment_share_token, logs to invoice_email_events.
 * Caller must have already validated customer + recipient and invoice sendability.
 */
export async function deliverInvoiceLinkEmail(opts: {
  supabase: SupabaseClient;
  userId: string;
  invoiceId: string;
  kind: "invoice_link" | "reminder";
  appBase: string;
  inv: InvoiceRow;
  customerName: string;
  toEmail: string;
}): Promise<
  | { ok: true; payUrl: string; messageId?: string; logWarning?: string }
  | { ok: false; error: string }
> {
  const { supabase, userId, invoiceId, kind, appBase, inv, customerName, toEmail } = opts;

  let token = inv.payment_share_token as string | null;
  if (!token) {
    token = randomBytes(24).toString("hex");
    const { error: upErr } = await supabase
      .from("invoices")
      .update({ payment_share_token: token, updated_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .eq("user_id", userId);
    if (upErr) return { ok: false, error: upErr.message };
  }

  const payUrl = `${appBase}/pay/${token}`;
  const amountLabel = formatMoney(inv.total_cents, (inv.currency as string) || "USD");
  const dueLabel = inv.due_date ? String(inv.due_date) : null;
  const invoiceNumber = String(inv.number);

  const [{ data: lineRows }, { data: invExtra }] = await Promise.all([
    supabase
      .from("invoice_line_items")
      .select("description,quantity,unit_amount_cents,sort_order")
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true }),
    supabase.from("invoices").select("created_at,notes").eq("id", invoiceId).eq("user_id", userId).maybeSingle(),
  ]);

  const normalizedLines = normalizeInvoiceLines(lineRows ?? [], { totalCents: inv.total_cents });
  const invoiceDocument = {
    currency: (inv.currency as string) || "USD",
    totalCents: inv.total_cents,
    issuedDateLabel: formatIssuedDateLabel(invExtra?.created_at as string | undefined),
    billToName: customerName,
    billToEmail: toEmail,
    lines: normalizedLines,
    notesPreview: notesPreview(invExtra?.notes as string | null | undefined),
  };

  const email =
    kind === "reminder"
      ? buildInvoiceReminderEmail({
          customerName,
          invoiceNumber,
          amountLabel,
          dueLabel,
          payUrl,
          invoiceDocument,
        })
      : buildInvoiceLinkEmail({
          customerName,
          invoiceNumber,
          amountLabel,
          dueLabel,
          payUrl,
          invoiceDocument,
        });

  let sendData: { messageId: string | undefined };
  try {
    sendData = await sendTransactionalEmail({
      to: toEmail,
      subject: email.subject,
      html: email.html,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }

  const reminderPatch =
    kind === "reminder"
      ? {
          last_reminder_sent_at: new Date().toISOString(),
          reminder_count: (Number(inv.reminder_count) || 0) + 1,
        }
      : {};

  const { error: invUpErr } = await supabase
    .from("invoices")
    .update({ ...reminderPatch, updated_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("user_id", userId);
  if (invUpErr) return { ok: false, error: invUpErr.message };

  const { error: logErr } = await supabase.from("invoice_email_events").insert({
    invoice_id: invoiceId,
    user_id: userId,
    kind,
    to_email: toEmail,
    provider_message_id: sendData.messageId ?? null,
  });

  if (logErr) {
    return {
      ok: true,
      payUrl,
      messageId: sendData.messageId,
      logWarning: "Email sent but audit log failed.",
    };
  }

  return { ok: true, payUrl, messageId: sendData.messageId };
}

/** After chat creates an invoice: email payment link if client has email, SMTP + app URL are configured, and total allows checkout. */
export async function trySendInvoiceLinkAfterChatCreate(opts: {
  supabase: SupabaseClient;
  userId: string;
  invoiceId: string;
  /** Pass through from the chat API route so payment links use the live host, not localhost. */
  request?: Request;
}): Promise<
  | { ok: true; toEmail: string }
  | { ok: false; reason: "smtp" | "app_url" | "not_found" | "bad_state" | "too_small" | "no_client_email" | "send" }
> {
  let appBase: string;
  try {
    appBase = assertAppUrl(opts.request);
  } catch {
    return { ok: false, reason: "app_url" };
  }

  try {
    getEmailFrom();
  } catch {
    return { ok: false, reason: "smtp" };
  }

  const { data: inv, error } = await opts.supabase
    .from("invoices")
    .select(
      "id,number,status,payment_share_token,total_cents,currency,due_date,reminder_count,customers(name,email)"
    )
    .eq("id", opts.invoiceId)
    .eq("user_id", opts.userId)
    .maybeSingle();

  if (error || !inv) return { ok: false, reason: "not_found" };

  if (inv.status === "paid" || inv.status === "cancelled") return { ok: false, reason: "bad_state" };
  if ((inv.total_cents as number) < 50) return { ok: false, reason: "too_small" };

  const rawCust = inv.customers as unknown;
  const customer = (Array.isArray(rawCust) ? rawCust[0] : rawCust) as {
    name: string | null;
    email: string | null;
  } | null;
  const toEmail = customer?.email?.trim();
  if (!toEmail) return { ok: false, reason: "no_client_email" };

  const customerName = customer?.name?.trim() || "there";

  const sent = await deliverInvoiceLinkEmail({
    supabase: opts.supabase,
    userId: opts.userId,
    invoiceId: opts.invoiceId,
    kind: "invoice_link",
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

  if (!sent.ok) return { ok: false, reason: "send" };
  return { ok: true, toEmail };
}
