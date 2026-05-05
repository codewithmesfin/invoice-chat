import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { syncInvoiceEmbedding } from "@/lib/embeddings/sync-entity";
import { insertInvoiceLineItems, sumLineItemsCents, type InvoiceLineItemInsert } from "@/lib/invoices/invoice-line-items-write";

const LineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.coerce.number().refine((n) => Number.isFinite(n) && n > 0, "quantity must be positive"),
  unit_amount_cents: z.number().int().min(0),
});

const PostSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  number: z.string().min(1).max(64),
  status: z
    .enum(["draft", "sent", "paid", "overdue", "cancelled"])
    .optional()
    .default("draft"),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  currency: z.string().min(1).max(8).optional().default("USD"),
  total_cents: z.number().int().min(0).optional().default(0),
  notes: z.string().max(2000).optional(),
  line_items: z.array(LineItemSchema).optional(),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id,number,status,payment_status,payment_share_token,due_date,currency,total_cents,notes,customer_id,created_at,customers(name,email)"
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoices: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PostSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const row = parsed.data;
  const lines: InvoiceLineItemInsert[] = (row.line_items ?? []).map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unit_amount_cents: l.unit_amount_cents,
  }));
  const total_cents =
    lines.length > 0 ? sumLineItemsCents(lines) : row.total_cents ?? 0;

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      user_id: user.id,
      customer_id: row.customer_id ?? null,
      number: row.number,
      status: row.status,
      due_date: row.due_date ?? null,
      currency: row.currency,
      total_cents,
      notes: row.notes ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  if (lines.length > 0) {
    const { error: lineErr } = await insertInvoiceLineItems(supabase, data.id, lines);
    if (lineErr) {
      await supabase.from("invoices").delete().eq("id", data.id).eq("user_id", user.id);
      return NextResponse.json({ error: lineErr }, { status: 500 });
    }
  }

  try {
    await syncInvoiceEmbedding(supabase, user.id, data.id);
  } catch {
    /* embedding sync best-effort */
  }

  return NextResponse.json({ id: data.id });
}
