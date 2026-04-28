const VISION_MODEL =
  process.env.OPENROUTER_VISION_MODEL?.trim() ||
  "meta-llama/llama-3.2-11b-vision-instruct:free";

function extractJsonObject(text: string): string {
  const t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  if (fence?.[1]) return fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return t;
}

export type ReceiptVisionResult = {
  amount_dollars: number | null;
  currency: string | null;
  merchant: string | null;
  spent_date: string | null;
  category: string | null;
  description: string | null;
  confidence: "high" | "low" | null;
};

const EMPTY: ReceiptVisionResult = {
  amount_dollars: null,
  currency: null,
  merchant: null,
  spent_date: null,
  category: null,
  description: null,
  confidence: null,
};

/**
 * Reads a receipt screenshot via OpenRouter vision and returns structured fields.
 */
export async function parseReceiptImageVision(opts: {
  mimeType: string;
  base64: string;
  userHint?: string;
}): Promise<ReceiptVisionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { ...EMPTY, description: "OPENROUTER_API_KEY not set" };
  }

  const referer = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const dataUrl = `data:${opts.mimeType};base64,${opts.base64}`;
  const hint = opts.userHint?.trim() ? `\nUser also wrote: ${opts.userHint.trim()}` : "";

  const body = {
    model: VISION_MODEL,
    temperature: 0.1,
    max_tokens: 600,
    messages: [
      {
        role: "system" as const,
        content:
          "You read expense receipts. Reply with STRICT JSON only, no markdown. Shape: " +
          '{"amount_dollars": number|null,"currency":"USD"|string|null,"merchant":string|null,' +
          '"spent_date":"YYYY-MM-DD"|null,"category":string|null,"description":string|null,' +
          '"confidence":"high"|"low"}. Use null when unknown. amount_dollars is total in dollars (e.g. 12.99).',
      },
      {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: `Extract expense fields from this receipt image.${hint}`,
          },
          {
            type: "image_url" as const,
            image_url: { url: dataUrl },
          },
        ],
      },
    ],
  };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": "Invoicing Receipt",
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  if (!res.ok) {
    return { ...EMPTY, description: `Vision request failed: ${res.status} ${rawText.slice(0, 200)}` };
  }

  let content = "";
  try {
    const data = JSON.parse(rawText) as {
      choices?: { message?: { content?: string | unknown[] } }[];
    };
    const msg = data.choices?.[0]?.message?.content;
    if (typeof msg === "string") content = msg;
    else if (Array.isArray(msg)) {
      content = msg
        .map((p) => (typeof p === "object" && p && "text" in p ? String((p as { text?: string }).text) : ""))
        .join("");
    }
  } catch {
    return { ...EMPTY, description: "Could not parse vision response" };
  }

  try {
    const json = JSON.parse(extractJsonObject(content));
    return {
      amount_dollars: typeof json.amount_dollars === "number" ? json.amount_dollars : null,
      currency: typeof json.currency === "string" ? json.currency : null,
      merchant: typeof json.merchant === "string" ? json.merchant : null,
      spent_date: typeof json.spent_date === "string" ? json.spent_date : null,
      category: typeof json.category === "string" ? json.category : null,
      description: typeof json.description === "string" ? json.description : null,
      confidence: json.confidence === "high" || json.confidence === "low" ? json.confidence : null,
    };
  } catch {
    return { ...EMPTY, description: content.slice(0, 300) };
  }
}
