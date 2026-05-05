import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { normalizeInvoiceLines } from "@/lib/invoices/invoice-lines";

export type PayInvoiceRow = {
  id: string;
  user_id: string;
  number: string;
  status: string;
  total_cents: number;
  currency: string;
  due_date: string | null;
  notes: string | null;
  payment_share_token: string | null;
  created_at: string;
  customers: { email: string | null; name: string | null } | null;
};

export type PublicPayLineItem = {
  description: string;
  quantity: number;
  unit_amount_cents: number;
  line_total_cents: number;
};

export type PublicPayInvoiceView = {
  number: string;
  total_cents: number;
  currency: string;
  due_date: string | null;
  notes_preview: string | null;
  customer_name: string | null;
  customer_email: string | null;
  issued_at_label: string | null;
  lines: PublicPayLineItem[];
};

export type PayLookupFailureReason =
  | "invalid"
  | "notfound"
  | "missing_service_role"
  | "supabase_public_env"
  | "admin_client_error";

export async function fetchInvoiceByPayToken(
  token: string
): Promise<
  | { ok: true; token: string; invoice: PayInvoiceRow; view: PublicPayInvoiceView }
  | { ok: false; reason: PayLookupFailureReason; detail?: string }
> {
  const t = token?.trim() ?? "";
  if (t.length < 16) {
    return { ok: false, reason: "invalid" };
  }

  const { url, key } = getSupabasePublicEnv();
  if (!url || !key) {
    return { ok: false, reason: "supabase_public_env" };
  }

  if (!hasServiceRoleKey()) {
    return { ok: false, reason: "missing_service_role" };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "admin_client_error", detail: msg };
  }

  const { data: inv, error } = await admin
    .from("invoices")
    .select(
      "id,user_id,number,status,total_cents,currency,due_date,notes,payment_share_token,created_at,customers(email,name)"
    )
    .eq("payment_share_token", t)
    .maybeSingle();

  const row = inv as PayInvoiceRow | null;
  if (error || !row || row.payment_share_token !== t) {
    return { ok: false, reason: "notfound" };
  }

  const cust = row.customers;
  const notes = row.notes?.trim() || null;
  const notes_preview =
    notes && notes.length > 400 ? `${notes.slice(0, 400)}…` : notes;

  const { data: rawLines } = await admin
    .from("invoice_line_items")
    .select("description,quantity,unit_amount_cents,sort_order")
    .eq("invoice_id", row.id)
    .order("sort_order", { ascending: true });

  const normalized = normalizeInvoiceLines(rawLines ?? [], { totalCents: row.total_cents });
  const lines: PublicPayLineItem[] = normalized.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unit_amount_cents: l.unitAmountCents,
    line_total_cents: l.lineTotalCents,
  }));

  let issued_at_label: string | null = null;
  try {
    const d = new Date(row.created_at);
    if (!Number.isNaN(d.getTime())) {
      issued_at_label = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
  } catch {
    issued_at_label = null;
  }

  const view: PublicPayInvoiceView = {
    number: row.number,
    total_cents: row.total_cents,
    currency: row.currency || "USD",
    due_date: row.due_date,
    notes_preview,
    customer_name: cust?.name?.trim() || null,
    customer_email: cust?.email?.trim() || null,
    issued_at_label,
    lines,
  };

  return { ok: true, token: t, invoice: row, view };
}
