/** Shared with agent tool and REST API: resolve cents from flexible input. */
export function pickExpenseCentsFromBody(input: {
  amount_cents?: number | null;
  total_cents?: number | null;
  amount?: string | null;
  amount_dollars?: string | number | null;
  total_dollars?: string | number | null;
}): number | null {
  if (typeof input.amount_cents === "number" && Number.isFinite(input.amount_cents)) {
    return Math.max(0, Math.round(input.amount_cents));
  }
  if (typeof input.total_cents === "number" && Number.isFinite(input.total_cents)) {
    return Math.max(0, Math.round(input.total_cents));
  }
  const dollars = input.amount_dollars ?? input.total_dollars ?? input.amount;
  if (typeof dollars === "number" && Number.isFinite(dollars)) {
    return Math.max(0, Math.round(dollars * 100));
  }
  if (typeof dollars === "string" && dollars.trim()) {
    const n = Number.parseFloat(dollars.replace(/[$,]/g, ""));
    if (!Number.isNaN(n)) return Math.max(0, Math.round(n * 100));
  }
  return null;
}
