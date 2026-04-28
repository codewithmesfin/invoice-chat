import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { syncInvoiceEmbedding } from "@/lib/embeddings/sync-entity";

const PatchSchema = z.object({
  notes: z.string().max(2000).nullable().optional(),
  status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: inv, error } = await supabase
    .from("invoices")
    .select(
      "id,number,status,payment_status,payment_share_token,stripe_checkout_session_id,due_date,currency,total_cents,notes,customer_id,created_at,updated_at,last_reminder_sent_at,reminder_count,customers(name,email)"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: attachments } = await supabase
    .from("invoice_attachments")
    .select("id,file_name,mime_type,size_bytes,created_at,extracted_text")
    .eq("invoice_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ invoice: inv, attachments: attachments ?? [] });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
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

  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.due_date !== undefined) patch.due_date = parsed.data.due_date;
  if (parsed.data.customer_id !== undefined) patch.customer_id = parsed.data.customer_id;

  const { data, error } = await supabase
    .from("invoices")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await syncInvoiceEmbedding(supabase, user.id, id);
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true });
}
