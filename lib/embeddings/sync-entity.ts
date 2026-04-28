import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/embeddings/openrouter";

export async function syncCustomerEmbedding(
  supabase: SupabaseClient,
  userId: string,
  customerId: string
) {
  const { data, error } = await supabase
    .from("customers")
    .select("name,email,notes")
    .eq("id", customerId)
    .eq("user_id", userId)
    .single();

  if (error || !data) return;

  const text = `Customer ${data.name}. Email: ${data.email ?? ""}. Notes: ${data.notes ?? ""}`;
  const embedding = await embedText(text);
  await supabase
    .from("customers")
    .update({ embedding: JSON.stringify(embedding) })
    .eq("id", customerId)
    .eq("user_id", userId);
}

export async function syncInvoiceEmbedding(
  supabase: SupabaseClient,
  userId: string,
  invoiceId: string
) {
  const { data, error } = await supabase
    .from("invoices")
    .select("number,status,payment_status,total_cents,currency,due_date,notes,customer_id,customers(name)")
    .eq("id", invoiceId)
    .eq("user_id", userId)
    .single();

  if (error || !data) return;

  const cust = data.customers as { name?: string } | null;
  const pay = (data as { payment_status?: string | null }).payment_status ?? "none";
  const text = `Invoice ${data.number} status=${data.status} payment_status=${pay} total_cents=${data.total_cents} ${data.currency} due=${data.due_date ?? ""} customer=${cust?.name ?? data.customer_id ?? "none"} notes=${data.notes ?? ""}`;
  const embedding = await embedText(text);
  await supabase
    .from("invoices")
    .update({ embedding: JSON.stringify(embedding) })
    .eq("id", invoiceId)
    .eq("user_id", userId);
}
