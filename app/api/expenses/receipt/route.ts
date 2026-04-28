import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError, SCHEMA_FIX_HINT } from "@/lib/supabase/errors";

const BUCKET = "expense-receipts";
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Please sign in to upload a receipt." },
      { status: 401 }
    );
  }

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Expected multipart form with a file field." },
      { status: 400 }
    );
  }

  const file = fd.get("file");
  if (!file || !(file instanceof Blob) || file.size === 0) {
    return NextResponse.json(
      { error: "missing_file", message: "Choose an image file (JPEG, PNG, or WebP)." },
      { status: 400 }
    );
  }

  const mime = (file as File).type === "image/jpg" ? "image/jpeg" : (file as File).type;
  const ext = ALLOWED.get(mime);
  if (!ext) {
    return NextResponse.json(
      { error: "invalid_type", message: "Use JPEG, PNG, or WebP for receipt images." },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "Each image must be 5 MB or smaller." },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const path = `${user.id}/manual/${randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: mime,
    upsert: false,
  });

  if (upErr) {
    const msg = upErr.message ?? "";
    const hint = isMissingTableError(msg)
      ? SCHEMA_FIX_HINT
      : /bucket not found|Bucket not found|No such/i.test(msg)
        ? "Create the expense-receipts bucket (see expenses migration)."
        : undefined;
    return NextResponse.json(
      {
        error: msg,
        message: isMissingTableError(msg)
          ? "Storage isn’t set up for receipts yet."
          : "Couldn’t upload this file. Try again.",
        ...(hint ? { hint } : {}),
      },
      { status: isMissingTableError(msg) ? 503 : 500 }
    );
  }

  return NextResponse.json({ path });
}
