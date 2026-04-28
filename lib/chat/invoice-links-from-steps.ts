/** Pull invoice id/number from stored agent step results (chat message metadata). */

type InvoiceRef = { id: string; number: string };

function addInvoice(out: Map<string, string>, id: string, number: unknown) {
  if (typeof id !== "string" || !id.trim()) return;
  const n = number != null && String(number).trim() ? String(number).trim() : "Invoice";
  out.set(id, n);
}

function collectFromRows(out: Map<string, string>, rows: unknown, limit: number) {
  if (!Array.isArray(rows)) return;
  for (const row of rows.slice(0, limit)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    addInvoice(out, r.id as string, r.number);
  }
}

export function extractInvoiceLinksFromSteps(steps: unknown): InvoiceRef[] {
  if (!Array.isArray(steps)) return [];
  const byId = new Map<string, string>();

  for (const raw of steps) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as { action?: string; status?: string; output?: unknown };
    if (s.status !== "done" || s.output === undefined || typeof s.output !== "object") continue;
    const out = s.output as Record<string, unknown>;

    if (s.action === "create_invoice") {
      const inv = out.invoice;
      if (inv && typeof inv === "object") {
        const o = inv as Record<string, unknown>;
        addInvoice(byId, o.id as string, o.number);
      }
    }

    if (s.action === "find_invoice_by_status") {
      collectFromRows(byId, out.invoices, 15);
    }

    if (s.action === "detect_overdue_invoices") {
      collectFromRows(byId, out.overdue, 15);
    }
  }

  return [...byId.entries()].map(([id, number]) => ({ id, number }));
}

export function extractInvoiceLinksFromMessageMetadata(metadata: unknown): InvoiceRef[] {
  if (!metadata || typeof metadata !== "object") return [];
  const steps = (metadata as { steps?: unknown }).steps;
  return extractInvoiceLinksFromSteps(steps);
}
