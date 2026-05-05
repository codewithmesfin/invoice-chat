import type { InvoiceLineItemInsert } from "@/lib/invoices/invoice-line-items-write";

function pickQuantity(o: Record<string, unknown>): number {
  const raw = o.quantity ?? o.qty;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number.parseFloat(raw.replace(/,/g, ""));
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 1;
}

function pickUnitCents(o: Record<string, unknown>): number | null {
  if (typeof o.unit_amount_cents === "number" && Number.isFinite(o.unit_amount_cents)) {
    return Math.max(0, Math.round(o.unit_amount_cents));
  }
  const dollarKeys = ["unit_dollars", "unit_price", "price", "rate", "amount"] as const;
  for (const k of dollarKeys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v * 100));
    if (typeof v === "string" && v.trim()) {
      const n = Number.parseFloat(v.replace(/[$,]/g, ""));
      if (!Number.isNaN(n)) return Math.max(0, Math.round(n * 100));
    }
  }
  return null;
}

function pickDescription(o: Record<string, unknown>): string {
  const d =
    typeof o.description === "string"
      ? o.description
      : typeof o.item === "string"
        ? o.item
        : typeof o.title === "string"
          ? o.title
          : typeof o.name === "string"
            ? o.name
            : "";
  return d.trim().slice(0, 500);
}

/** Parses flexible chat/agent payloads: line_items, items, or lines arrays. */
export function parseToolInvoiceLineItems(input: Record<string, unknown>): InvoiceLineItemInsert[] | null {
  const raw = input.line_items ?? input.items ?? input.lines;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const out: InvoiceLineItemInsert[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const description = pickDescription(o);
    if (!description) continue;
    const unit_amount_cents = pickUnitCents(o);
    if (unit_amount_cents === null) continue;
    const quantity = pickQuantity(o);
    out.push({ description, quantity, unit_amount_cents });
  }

  return out.length > 0 ? out : null;
}
