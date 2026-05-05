import type { SupabaseClient } from "@supabase/supabase-js";

export type InvoiceLineItemInsert = {
  description: string;
  quantity: number;
  unit_amount_cents: number;
};

export function sumLineItemsCents(lines: InvoiceLineItemInsert[]): number {
  let sum = 0;
  for (const l of lines) {
    sum += Math.round(Number(l.quantity) * l.unit_amount_cents);
  }
  return Math.max(0, sum);
}

export async function insertInvoiceLineItems(
  supabase: SupabaseClient,
  invoiceId: string,
  lines: InvoiceLineItemInsert[]
): Promise<{ error: string | null }> {
  if (lines.length === 0) return { error: null };
  const rows = lines.map((l, i) => ({
    invoice_id: invoiceId,
    description: l.description.trim().slice(0, 500),
    quantity: Number(l.quantity),
    unit_amount_cents: l.unit_amount_cents,
    sort_order: i,
  }));
  const { error } = await supabase.from("invoice_line_items").insert(rows);
  return { error: error?.message ?? null };
}
