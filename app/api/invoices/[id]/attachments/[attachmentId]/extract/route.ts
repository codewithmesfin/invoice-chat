import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PDF_PLACEHOLDER =
  "Text extraction / OCR is not enabled yet. The file is stored securely for search and automation in a future update.";

export async function POST(
  _req: Request,
  { params }: { params: { id: string; attachmentId: string } }
) {
  const { id: invoiceId, attachmentId } = params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: row, error } = await supabase
    .from("invoice_attachments")
    .select("id,invoice_id,mime_type,extracted_text")
    .eq("id", attachmentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row || row.invoice_id !== invoiceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const mime = row.mime_type as string;
  let extracted = row.extracted_text as string | null;
  if (mime === "application/pdf") {
    extracted = PDF_PLACEHOLDER;
  } else if (mime === "text/plain" && extracted) {
    return NextResponse.json({ ok: true, extracted_text: extracted, note: "Plain text already captured on upload." });
  } else {
    extracted = "No extractor configured for this file type yet.";
  }

  const { error: upErr } = await supabase
    .from("invoice_attachments")
    .update({ extracted_text: extracted })
    .eq("id", attachmentId)
    .eq("user_id", user.id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, extracted_text: extracted });
}
