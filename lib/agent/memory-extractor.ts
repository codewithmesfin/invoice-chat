import { z } from "zod";
import { embedText } from "@/lib/embeddings/openrouter";
import { memoryExtractorSystemPrompt } from "@/lib/agent/prompts";
import { chatComplete } from "@/lib/openrouter/chat";
import type { SupabaseClient } from "@supabase/supabase-js";

const ExtractSchema = z.object({
  memories: z
    .array(
      z.object({
        content: z.string(),
        type: z.enum([
          "fact",
          "preference",
          "financial",
          "entity",
          "insight",
          "other",
        ]),
      })
    )
    .max(5),
});

function extractJsonObject(text: string): string {
  const t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  if (fence?.[1]) return fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return t;
}

export async function extractAndStoreMemories(input: {
  supabase: SupabaseClient;
  userId: string;
  transcript: string;
}) {
  if (!input.transcript.trim()) return;

  const messages = [
    { role: "system" as const, content: memoryExtractorSystemPrompt() },
    {
      role: "user" as const,
      content: `Transcript:\n${input.transcript.slice(0, 12000)}`,
    },
  ];

  let raw: string;
  try {
    raw = await chatComplete(messages, {
      jsonMode: true,
      temperature: 0.1,
      maxTokens: 800,
    });
  } catch {
    raw = await chatComplete(messages, {
      jsonMode: false,
      temperature: 0.1,
      maxTokens: 800,
    });
  }

  let parsed: z.infer<typeof ExtractSchema>;
  try {
    const json = extractJsonObject(raw);
    const r = ExtractSchema.safeParse(JSON.parse(json));
    if (!r.success) return;
    parsed = r.data;
  } catch {
    return;
  }

  for (const m of parsed.memories) {
    const content = m.content.trim();
    if (!content) continue;

    const embedding = await embedText(content);
    await input.supabase.from("memories").insert({
      user_id: input.userId,
      content,
      type: m.type,
      embedding: JSON.stringify(embedding),
    });
  }
}
