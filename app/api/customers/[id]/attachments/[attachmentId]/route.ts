import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "invoice-attachments";

export async function GET(
  req: Request,
  { params }: { params: { id: string; attachmentId: string } }
) {
  const { id: customerId, attachmentId } = params;
  const url = new URL(req.url);
  const sign = url.searchParams.get("sign") === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: row, error } = await supabase
    .from("invoice_attachments")
    .select("id,customer_id,storage_path")
    .eq("id", attachmentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row || row.customer_id !== customerId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!sign) {
    return NextResponse.json({ ok: true });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server storage not configured";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const { data: signed, error: sErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, 120);

  if (sErr || !signed?.signedUrl) {
    return NextResponse.json({ error: sErr?.message ?? "Could not sign URL" }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; attachmentId: string } }
) {
  const { id: customerId, attachmentId } = params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: row, error } = await supabase
    .from("invoice_attachments")
    .select("id,customer_id,storage_path")
    .eq("id", attachmentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row || row.customer_id !== customerId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server storage not configured";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  await admin.storage.from(BUCKET).remove([row.storage_path]);
  const { error: delErr } = await supabase.from("invoice_attachments").delete().eq("id", attachmentId);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
