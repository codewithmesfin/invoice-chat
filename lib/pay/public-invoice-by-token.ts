import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

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
  customers: { email: string | null; name: string | null } | null;
};

export type PublicPayInvoiceView = {
  number: string;
  total_cents: number;
  currency: string;
  due_date: string | null;
  notes_preview: string | null;
  customer_name: string | null;
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
      "id,user_id,number,status,total_cents,currency,due_date,notes,payment_share_token,customers(email,name)"
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

  const view: PublicPayInvoiceView = {
    number: row.number,
    total_cents: row.total_cents,
    currency: row.currency || "USD",
    due_date: row.due_date,
    notes_preview,
    customer_name: cust?.name?.trim() || null,
  };

  return { ok: true, token: t, invoice: row, view };
}
