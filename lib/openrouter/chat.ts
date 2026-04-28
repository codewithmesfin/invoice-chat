export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const PRIMARY_MODEL =
  process.env.OPENROUTER_CHAT_MODEL?.trim() || "meta-llama/llama-3.2-3b-instruct:free";

function chatModelCandidates(): string[] {
  const extra = (process.env.OPENROUTER_CHAT_MODEL_FALLBACKS ?? "openrouter/auto")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([PRIMARY_MODEL, ...extra])];
}

export async function chatComplete(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; jsonMode?: boolean }
) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const referer = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let lastErr = "";

  for (const model of chatModelCandidates()) {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 2048,
    };

    if (options?.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": "Invoicing Agent",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (content) return content.trim();
      lastErr = "empty content";
      continue;
    }

    const t = await res.text();
    lastErr = `${res.status} ${t}`;
    if ([429, 503, 404].includes(res.status)) {
      continue;
    }
    throw new Error(`OpenRouter chat failed: ${lastErr}`);
  }

  throw new Error(`OpenRouter chat failed (all models exhausted): ${lastErr}`);
}
