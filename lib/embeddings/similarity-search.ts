import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/embeddings/openrouter";

export type MemoryMatch = {
  id: string;
  content: string;
  type: string;
  similarity: number;
};

export type CustomerMatch = {
  id: string;
  name: string;
  email: string | null;
  notes: string | null;
  similarity: number;
};

export type InvoiceMatch = {
  id: string;
  number: string;
  status: string;
  total_cents: number;
  currency: string;
  due_date: string | null;
  notes: string | null;
  similarity: number;
};

export async function similaritySearch(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  options?: { perTable?: number }
) {
  const perTable = Math.min(options?.perTable ?? 6, 12);
  const vec = await embedText(query);

  const [memRes, custRes, invRes] = await Promise.all([
    supabase.rpc("match_memories", {
      p_user_id: userId,
      p_query_embedding: vec,
      match_count: perTable,
    }),
    supabase.rpc("match_customers", {
      p_user_id: userId,
      p_query_embedding: vec,
      match_count: perTable,
    }),
    supabase.rpc("match_invoices", {
      p_user_id: userId,
      p_query_embedding: vec,
      match_count: perTable,
    }),
  ]);

  return {
    memories: (memRes.data ?? []) as MemoryMatch[],
    customers: (custRes.data ?? []) as CustomerMatch[],
    invoices: (invRes.data ?? []) as InvoiceMatch[],
    errors: {
      memories: memRes.error?.message,
      customers: custRes.error?.message,
      invoices: invRes.error?.message,
    },
  };
}

export function formatRagContext(result: Awaited<ReturnType<typeof similaritySearch>>) {
  const parts: string[] = [];

  if (result.memories.length) {
    parts.push(
      "Long-term memories (retrieved):\n" +
        result.memories
          .map((m) => `- [${m.type}] ${m.content} (sim ${m.similarity.toFixed(3)})`)
          .join("\n")
    );
  }
  if (result.customers.length) {
    parts.push(
      "Similar customers:\n" +
        result.customers
          .map(
            (c) =>
              `- ${c.name} (${c.email ?? "no email"}) id=${c.id} notes=${c.notes ?? ""}`
          )
          .join("\n")
    );
  }
  if (result.invoices.length) {
    parts.push(
      "Similar invoices:\n" +
        result.invoices
          .map(
            (i) =>
              `- #${i.number} status=${i.status} total=${(i.total_cents / 100).toFixed(2)} ${i.currency} due=${i.due_date ?? "n/a"} id=${i.id}`
          )
          .join("\n")
    );
  }

  if (
    result.errors.memories ||
    result.errors.customers ||
    result.errors.invoices
  ) {
    parts.push(
      "Retrieval notes: some vector indexes may be empty until embeddings exist. Errors: " +
        JSON.stringify(result.errors)
    );
  }

  return parts.length ? parts.join("\n\n") : "No vector matches (empty index or first run).";
}
