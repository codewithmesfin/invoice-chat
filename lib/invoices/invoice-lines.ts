export type InvoiceLineNormalized = {
  description: string;
  quantity: number;
  unitAmountCents: number;
  lineTotalCents: number;
};

type DbLine = {
  description: string;
  quantity: unknown;
  unit_amount_cents: number;
};

function roundMoney(cents: number) {
  return Math.round(cents);
}

/**
 * Normalizes DB line items; if none exist, uses a single line for the invoice total (matches checkout behavior).
 */
export function normalizeInvoiceLines(
  rows: DbLine[] | null | undefined,
  fallback: { totalCents: number }
): InvoiceLineNormalized[] {
  const list = rows ?? [];
  if (list.length === 0) {
    return [
      {
        description: "Invoice balance",
        quantity: 1,
        unitAmountCents: fallback.totalCents,
        lineTotalCents: fallback.totalCents,
      },
    ];
  }
  return list.map((r) => {
    const qty = Number(r.quantity);
    const q = Number.isFinite(qty) && qty > 0 ? qty : 1;
    const lineTotal = roundMoney(q * r.unit_amount_cents);
    return {
      description: r.description,
      quantity: q,
      unitAmountCents: r.unit_amount_cents,
      lineTotalCents: lineTotal,
    };
  });
}
