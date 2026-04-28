import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { processReceiptsForChat } from "@/lib/chat/process-receipts";
import { formatRagContext, similaritySearch } from "@/lib/embeddings/similarity-search";
import { runPlanner } from "@/lib/agent/planner";
import { executePlan, formatToolTrace } from "@/lib/agent/executor";
import { extractAndStoreMemories } from "@/lib/agent/memory-extractor";
import {
  finalAnswerSystemPrompt,
  finalAnswerUserPayload,
} from "@/lib/agent/prompts";
import { chatComplete } from "@/lib/openrouter/chat";
import { trySendInvoiceLinkAfterChatCreate } from "@/lib/invoices/deliver-invoice-link-email";
import type { StepExecution } from "@/lib/agent/types";
import { isMissingTableError, SCHEMA_FIX_HINT } from "@/lib/supabase/errors";

const ReceiptSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  base64: z.string().min(20).max(6_000_000),
});

const BodySchema = z
  .object({
    message: z.string().max(8000).default(""),
    sessionId: z.string().uuid().optional(),
    receipts: z.array(ReceiptSchema).max(3).optional().default([]),
  })
  .refine((d) => d.message.trim().length > 0 || (d.receipts && d.receipts.length > 0), {
    message: "Send a message and/or at least one receipt image.",
    path: ["message"],
  });

const SHORT_TERM_N = 12;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Please sign in again to use the assistant." },
      { status: 401 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "We couldn’t read that message. Try sending again." },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: "Add some text or at least one receipt image (JPEG, PNG, or WebP).",
      },
      { status: 400 }
    );
  }

  try {
  const { message, sessionId: incomingSession, receipts } = parsed.data;

  const receiptOutcome = await processReceiptsForChat({
    supabase,
    userId: user.id,
    message,
    receipts,
  });
  if (!receiptOutcome.ok) {
    const msg =
      receiptOutcome.status >= 500
        ? "We couldn’t process your receipt images. Try again in a moment."
        : receiptOutcome.status === 400
          ? receiptOutcome.error
          : "Something went wrong with your uploads.";
    return NextResponse.json(
      {
        error: receiptOutcome.error,
        message: msg,
        ...(receiptOutcome.hint ? { hint: receiptOutcome.hint } : {}),
      },
      { status: receiptOutcome.status }
    );
  }
  const { uploadedPaths, visionSnippets } = receiptOutcome;

  const plannerMessage = [
    message.trim() || "(User attached receipt image(s) only — use vision data and paths below.)",
    uploadedPaths.length
      ? `Receipt file(s) uploaded for this message (exact paths for create_expense.receipt_storage_path):\n${uploadedPaths.map((p) => `- ${p}`).join("\n")}`
      : "",
    visionSnippets.length
      ? `Vision model extraction per receipt (populate create_expense; user should confirm ambiguous amounts):\n${visionSnippets.join("\n---\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const userDisplayContent = [
    message.trim(),
    uploadedPaths.length ? `[${uploadedPaths.length} receipt image(s) attached]` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let sessionId = incomingSession;
  if (!sessionId) {
    const titleSeed = message.trim() || "Receipt";
    const { data: sess, error: sErr } = await supabase
      .from("chat_sessions")
      .insert({ user_id: user.id, title: titleSeed.slice(0, 80) })
      .select("id")
      .single();
    if (sErr || !sess) {
      const msg = sErr?.message ?? "Could not create session";
      const status = isMissingTableError(msg) ? 503 : 500;
      return NextResponse.json(
        {
          error: msg,
          message: isMissingTableError(msg)
            ? "Chat isn’t set up in this workspace yet. Check the hint below."
            : "We couldn’t start a new chat. Try again in a moment.",
          ...(isMissingTableError(msg) ? { hint: SCHEMA_FIX_HINT } : {}),
        },
        { status }
      );
    }
    sessionId = sess.id;
  }

  const ragDisabled = process.env.CHAT_DISABLE_RAG === "1";

  const [ragText, priorRes] = await Promise.all([
    (async () => {
      if (ragDisabled) return "";
      try {
        const rag = await similaritySearch(supabase, user.id, plannerMessage, {
          perTable: 4,
        });
        return formatRagContext(rag);
      } catch (e) {
        return (
          "RAG unavailable for this request: " +
          (e instanceof Error ? e.message : String(e))
        );
      }
    })(),
    supabase
      .from("chat_messages")
      .select("role,content,metadata")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);

  const { data: prior, error: priorErr } = priorRes;
  if (priorErr) {
    if (isMissingTableError(priorErr.message)) {
      return NextResponse.json(
        {
          error: priorErr.message,
          message: "Chat history tables are missing. See the hint below.",
          hint: SCHEMA_FIX_HINT,
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error: priorErr.message,
        message: "We couldn’t load earlier messages in this thread.",
      },
      { status: 500 }
    );
  }

  const tail = (prior ?? []).slice(-SHORT_TERM_N);
  const shortTermSummary = tail
    .map(
      (m) =>
        `${m.role}: ${m.content}` +
        (m.metadata && Object.keys(m.metadata as object).length
          ? ` meta=${JSON.stringify(m.metadata).slice(0, 400)}`
          : "")
    )
    .join("\n");

  const plan = await runPlanner({
    userMessage: plannerMessage,
    ragContext: ragText,
    shortTermSummary,
  });

  const stepResults = await executePlan(plan, {
    supabase,
    userId: user.id,
  });

  const toolTrace = formatToolTrace(plan, stepResults);

  const answer = await chatComplete(
    [
      { role: "system", content: finalAnswerSystemPrompt() },
      {
        role: "user",
        content: finalAnswerUserPayload({
          userMessage: plannerMessage,
          ragContext: ragText,
          plan: JSON.stringify(plan, null, 2),
          toolTrace,
        }),
      },
    ],
    { temperature: 0.4, maxTokens: 1500 }
  );

  let assistantContent = answer;
  const autoEmailLines: string[] = [];
  for (const step of stepResults as StepExecution[]) {
    if (step.action !== "create_invoice" || step.status !== "done") continue;
    const out = step.output;
    if (!out || typeof out !== "object") continue;
    const invoice = (out as { invoice?: { id?: unknown } }).invoice;
    const invoiceId =
      invoice &&
      typeof invoice === "object" &&
      typeof (invoice as { id?: unknown }).id === "string"
        ? String((invoice as { id: string }).id)
        : null;
    if (!invoiceId) continue;
    const sent = await trySendInvoiceLinkAfterChatCreate({
      supabase,
      userId: user.id,
      invoiceId,
      request: req,
    });
    if (sent.ok) {
      autoEmailLines.push(`A payment link for the new invoice was emailed to ${sent.toEmail}.`);
    }
  }
  if (autoEmailLines.length) {
    assistantContent = `${assistantContent.trim()}\n\n${autoEmailLines.join("\n")}`;
  }

  const userMsgIns = await supabase.from("chat_messages").insert({
    session_id: sessionId,
    user_id: user.id,
    role: "user",
    content: userDisplayContent,
    metadata: {
      ...(uploadedPaths.length ? { receipt_paths: uploadedPaths, receipt_vision: visionSnippets } : {}),
    },
  });
  if (userMsgIns.error) {
    if (isMissingTableError(userMsgIns.error.message)) {
      return NextResponse.json(
        {
          error: userMsgIns.error.message,
          message: "Chat storage isn’t available. See the hint below.",
          hint: SCHEMA_FIX_HINT,
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error: userMsgIns.error.message,
        message: "We couldn’t save your message. Try again.",
      },
      { status: 500 }
    );
  }

  const asstIns = await supabase.from("chat_messages").insert({
    session_id: sessionId,
    user_id: user.id,
    role: "assistant",
    content: assistantContent,
    metadata: {
      plan,
      steps: stepResults,
    },
  });
  if (asstIns.error) {
    if (isMissingTableError(asstIns.error.message)) {
      return NextResponse.json(
        {
          error: asstIns.error.message,
          message: "Chat storage isn’t available. See the hint below.",
          hint: SCHEMA_FIX_HINT,
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error: asstIns.error.message,
        message: "We couldn’t save the assistant reply. Try sending again.",
      },
      { status: 500 }
    );
  }

  const sessUp = await supabase
    .from("chat_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (sessUp.error && isMissingTableError(sessUp.error.message)) {
    return NextResponse.json(
      {
        error: sessUp.error.message,
        message: "Chat session couldn’t be updated. See the hint below.",
        hint: SCHEMA_FIX_HINT,
      },
      { status: 503 }
    );
  }

  void extractAndStoreMemories({
    supabase,
    userId: user.id,
    transcript: `User: ${userDisplayContent}\nAssistant: ${assistantContent}`,
  }).catch(() => {
    /* best-effort; do not block response */
  });

  return NextResponse.json({
    reply: assistantContent,
    sessionId,
    plan,
    steps: stepResults,
  });
  } catch (e) {
    console.error("[api/chat]", e);
    return NextResponse.json(
      {
        error: "unexpected",
        message:
          "The assistant hit an unexpected problem. Your message was kept — try Retry, or rephrase and send again.",
      },
      { status: 502 }
    );
  }
}
