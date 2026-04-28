import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { parseReceiptImageVision } from "@/lib/openrouter/receipt-vision";
import { isMissingTableError, SCHEMA_FIX_HINT } from "@/lib/supabase/errors";

const BUCKET = "expense-receipts";

function extForReceiptMime(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "img";
}

export type ReceiptInput = { mimeType: "image/jpeg" | "image/png" | "image/webp"; base64: string };

export type ProcessReceiptsResult =
  | { ok: true; uploadedPaths: string[]; visionSnippets: string[] }
  | { ok: false; status: number; error: string; hint?: string };

/**
 * Upload each receipt and run vision in parallel (one vision per image, all images at once).
 */
export async function processReceiptsForChat(opts: {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  receipts: ReceiptInput[];
}): Promise<ProcessReceiptsResult> {
  const { supabase, userId, message, receipts } = opts;
  if (!receipts.length) {
    return { ok: true, uploadedPaths: [], visionSnippets: [] };
  }

  const results = await Promise.all(
    receipts.map(async (r, i) => {
      let b64 = r.base64.replace(/\s/g, "");
      if (b64.includes(",")) {
        b64 = b64.split(",").pop() ?? b64;
      }
      const buf = Buffer.from(b64, "base64");
      if (!buf.length || buf.length > 5 * 1024 * 1024) {
        return {
          kind: "bad_input" as const,
          error: `Receipt ${i + 1} is empty or too large (max 5 MB).`,
        };
      }
      const ext = extForReceiptMime(r.mimeType);
      const path = `${userId}/chat/${randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buf, {
        contentType: r.mimeType,
        upsert: false,
      });
      if (upErr) {
        const msg = upErr.message ?? "";
        const hint = isMissingTableError(msg)
          ? SCHEMA_FIX_HINT
          : /bucket not found|Bucket not found|No such/i.test(msg)
            ? "Run supabase/migrations/20250427160000_expenses.sql (creates expense-receipts storage + expenses table)."
            : undefined;
        return { kind: "upload_err" as const, error: msg, hint };
      }
      const vis = await parseReceiptImageVision({
        mimeType: r.mimeType,
        base64: b64,
        userHint: message.trim() || undefined,
      });
      return {
        kind: "ok" as const,
        path,
        snippet: JSON.stringify({ image_index: i + 1, ...vis }),
      };
    })
  );

  for (const res of results) {
    if (res.kind === "bad_input") {
      return { ok: false, status: 400, error: res.error };
    }
    if (res.kind === "upload_err") {
      return {
        ok: false,
        status: isMissingTableError(res.error) ? 503 : 500,
        error: res.error,
        ...(res.hint ? { hint: res.hint } : {}),
      };
    }
  }

  const uploadedPaths = results
    .filter((r): r is { kind: "ok"; path: string; snippet: string } => r.kind === "ok")
    .map((r) => r.path);
  const visionSnippets = results
    .filter((r): r is { kind: "ok"; path: string; snippet: string } => r.kind === "ok")
    .map((r) => r.snippet);

  return { ok: true, uploadedPaths, visionSnippets };
}
