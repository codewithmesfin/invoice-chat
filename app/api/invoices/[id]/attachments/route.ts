import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "invoice-attachments";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
]);

function safeFileName(name: string) {
  const base = name.replace(/[/\\]/g, "").slice(0, 180);
  return base || "file";
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const invoiceId = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: inv } = await supabase
    .from("invoices")
    .select("id")
    .eq("id", invoiceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("invoice_attachments")
    .select("id,file_name,mime_type,size_bytes,created_at,extracted_text")
    .eq("invoice_id", invoiceId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ attachments: data ?? [] });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const invoiceId = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: inv } = await supabase
    .from("invoices")
    .select("id")
    .eq("id", invoiceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server storage not configured";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected multipart field \"file\"." }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED.has(mime)) {
    return NextResponse.json(
      { error: "Unsupported file type. Use PDF, PNG, JPEG, WebP, or plain text." },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 10 MB)." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const fileName = safeFileName(file.name);
  const objectPath = `${user.id}/${invoiceId}/${randomUUID()}_${fileName}`;

  const { error: upErr } = await admin.storage.from(BUCKET).upload(objectPath, buf, {
    contentType: mime,
    upsert: false,
  });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  let extractedText: string | null = null;
  if (mime === "text/plain") {
    extractedText = buf.toString("utf8").slice(0, 50000);
  }

  const { data: row, error: insErr } = await supabase
    .from("invoice_attachments")
    .insert({
      user_id: user.id,
      invoice_id: invoiceId,
      customer_id: null,
      storage_path: objectPath,
      file_name: fileName,
      mime_type: mime,
      size_bytes: file.size,
      extracted_text: extractedText,
    })
    .select("id,file_name,mime_type,size_bytes,created_at,extracted_text")
    .single();

  if (insErr) {
    await admin.storage.from(BUCKET).remove([objectPath]);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ attachment: row });
}
