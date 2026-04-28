const EMBEDDING_DIM = 2048;
const DEFAULT_EMBEDDING_MODEL =
  process.env.OPENROUTER_EMBEDDING_MODEL ?? "nvidia/llama-nemotron-embed-vl-1b-v2:free";

const embedCache = new Map<string, number[]>();
const MAX_CACHE = 256;

function cacheKey(text: string, model: string) {
  return `${model}::${text.slice(0, 2000)}`;
}

export function getExpectedEmbeddingDimensions() {
  return EMBEDDING_DIM;
}

export async function embedText(text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) {
    return Array(EMBEDDING_DIM).fill(0);
  }

  const model = DEFAULT_EMBEDDING_MODEL;
  const key = cacheKey(trimmed, model);
  const hit = embedCache.get(key);
  if (hit) return hit;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "Invoicing Agent",
    },
    body: JSON.stringify({
      model,
      input: trimmed,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter embeddings failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    data?: { embedding?: number[] }[];
  };
  const embedding = data.data?.[0]?.embedding;
  if (!embedding?.length) {
    throw new Error("OpenRouter embeddings: empty vector");
  }

  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding dimension mismatch: got ${embedding.length}, expected ${EMBEDDING_DIM}. Update DB vector(...) and EMBEDDING_DIM.`
    );
  }

  if (embedCache.size >= MAX_CACHE) {
    const first = embedCache.keys().next().value;
    if (first) embedCache.delete(first);
  }
  embedCache.set(key, embedding);

  return embedding;
}
