import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolName } from "@/lib/agent/types";
import { syncCustomerEmbedding, syncInvoiceEmbedding } from "@/lib/embeddings/sync-entity";
import { pickExpenseCentsFromBody } from "@/lib/expenses/parse-amount";

export type ToolContext = {
  supabase: SupabaseClient;
  userId: string;
};

export async function runTool(
  name: ToolName,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  switch (name) {
    case "find_customer_by_name":
      return findCustomerByName(ctx, String(input.query ?? ""));
    case "find_invoice_by_status":
      return findInvoiceByStatus(ctx, String(input.status ?? "draft"));
    case "summarize_finances":
      return summarizeFinances(ctx);
    case "detect_overdue_invoices":
      return detectOverdueInvoices(ctx);
    case "create_invoice":
      return createInvoice(ctx, input);
    case "create_customer":
      return createCustomer(ctx, input);
    case "create_expense":
      return createExpense(ctx, input);
    case "list_expenses":
      return listExpenses(ctx, input);
    default:
      return { error: "unknown tool" };
  }
}

async function findCustomerByName(ctx: ToolContext, query: string) {
  const q = query.trim();
  if (!q) return { customers: [] };

  const { data, error } = await ctx.supabase
    .from("customers")
    .select("id,name,email,phone,notes,created_at")
    .eq("user_id", ctx.userId)
    .ilike("name", `%${q}%`)
    .limit(20);

  if (error) throw new Error(error.message);
  return { customers: data ?? [] };
}

async function findInvoiceByStatus(ctx: ToolContext, status: string) {
  const allowed = new Set(["draft", "sent", "paid", "overdue", "cancelled"]);
  const s = allowed.has(status) ? status : "draft";

  const { data, error } = await ctx.supabase
    .from("invoices")
    .select(
      "id,number,status,due_date,currency,total_cents,customer_id,notes,created_at,customers(name)"
    )
    .eq("user_id", ctx.userId)
    .eq("status", s)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return { invoices: data ?? [] };
}

async function summarizeFinances(ctx: ToolContext) {
  const { data, error } = await ctx.supabase
    .from("invoices")
    .select("status,total_cents,currency")
    .eq("user_id", ctx.userId);

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const byStatus: Record<string, { count: number; total_cents: number }> = {};
  for (const row of rows) {
    const st = row.status as string;
    if (!byStatus[st]) byStatus[st] = { count: 0, total_cents: 0 };
    byStatus[st].count += 1;
    byStatus[st].total_cents += row.total_cents ?? 0;
  }

  const currency = rows[0]?.currency ?? "USD";
  return {
    currency,
    by_status: byStatus,
    invoice_count: rows.length,
  };
}

async function detectOverdueInvoices(ctx: ToolContext) {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await ctx.supabase
    .from("invoices")
    .select(
      "id,number,status,due_date,currency,total_cents,customer_id,customers(name)"
    )
    .eq("user_id", ctx.userId)
    .not("due_date", "is", null)
    .lt("due_date", today)
    .neq("status", "paid")
    .neq("status", "cancelled")
    .order("due_date", { ascending: true })
    .limit(100);

  if (error) throw new Error(error.message);
  return { overdue: data ?? [] };
}

const STATUS_SET = new Set(["draft", "sent", "paid", "overdue", "cancelled"]);

function pickNumber(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s) return s.slice(0, 64);
  return `INV-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function pickTotalCents(input: Record<string, unknown>): number | null {
  const cents = input.total_cents;
  if (typeof cents === "number" && Number.isFinite(cents)) {
    return Math.max(0, Math.round(cents));
  }
  const dollars = input.total_dollars ?? input.amount;
  if (typeof dollars === "number" && Number.isFinite(dollars)) {
    return Math.max(0, Math.round(dollars * 100));
  }
  if (typeof dollars === "string" && dollars.trim()) {
    const n = Number.parseFloat(dollars.replace(/[$,]/g, ""));
    if (!Number.isNaN(n)) return Math.max(0, Math.round(n * 100));
  }
  return null;
}

function pickCustomerNameQuery(input: Record<string, unknown>): string {
  const fromName =
    typeof input.customer_name === "string" ? input.customer_name.trim() : "";
  if (fromName) return fromName;
  const fromQuery =
    typeof input.customer_query === "string" ? input.customer_query.trim() : "";
  return fromQuery;
}

async function resolveCustomerIdByName(
  ctx: ToolContext,
  nameQ: string
): Promise<
  | { customer_id: string | null; resolution_note: string }
  | { error: "multiple_customers_match"; customers: { id: string; name: string; email: string | null; phone: string | null }[] }
> {
  const { data, error } = await ctx.supabase
    .from("customers")
    .select("id,name,email,phone")
    .eq("user_id", ctx.userId)
    .ilike("name", `%${nameQ}%`)
    .limit(8);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) {
    return {
      customer_id: null,
      resolution_note: `No client matched "${nameQ}"; invoice created without a client.`,
    };
  }
  if (rows.length > 1) {
    return {
      error: "multiple_customers_match",
      customers: rows.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        email: (r.email as string | null) ?? null,
        phone: (r.phone as string | null) ?? null,
      })),
    };
  }

  const one = rows[0] as { id: string; name: string };
  return {
    customer_id: one.id,
    resolution_note: `Linked to client "${one.name}".`,
  };
}

async function resolveCustomerId(
  ctx: ToolContext,
  input: Record<string, unknown>
): Promise<
  | { customer_id: string | null; resolution_note: string }
  | { error: string; customers?: { id: string; name: string; email: string | null; phone: string | null }[] }
> {
  const nameQ = pickCustomerNameQuery(input);

  const idRaw = input.customer_id;
  if (typeof idRaw === "string" && /^[0-9a-f-]{36}$/i.test(idRaw.trim())) {
    const id = idRaw.trim();
    const { data, error } = await ctx.supabase
      .from("customers")
      .select("id,name")
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) {
      return { customer_id: id, resolution_note: `Linked to client "${data.name}".` };
    }
    // UUID not in this account (often a model placeholder) — fall back to name if provided
    if (nameQ) {
      return resolveCustomerIdByName(ctx, nameQ);
    }
    return { error: "customer_id not found for this account" };
  }

  if (!nameQ) {
    return { customer_id: null, resolution_note: "No client linked (no customer_id or name)." };
  }

  return resolveCustomerIdByName(ctx, nameQ);
}

async function createInvoice(ctx: ToolContext, input: Record<string, unknown>) {
  const total_cents = pickTotalCents(input);
  if (total_cents === null) {
    return {
      error:
        "Missing amount. Pass total_cents (integer cents) or total_dollars / amount (e.g. 199.50).",
    };
  }

  const resolved = await resolveCustomerId(ctx, input);
  if ("error" in resolved) {
    if (resolved.error === "multiple_customers_match") {
      return {
        error: "ambiguous_customer",
        message:
          "Several clients matched the name. Call find_customer_by_name or create_invoice with customer_id.",
        matches: resolved.customers,
      };
    }
    return { error: resolved.error };
  }

  const { customer_id, resolution_note } = resolved;

  let status = typeof input.status === "string" ? input.status.toLowerCase() : "draft";
  if (!STATUS_SET.has(status)) status = "draft";

  let due_date: string | null = null;
  const due = input.due_date;
  if (typeof due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(due)) due_date = due;
  else if (due === null) due_date = null;

  const currency =
    typeof input.currency === "string" && input.currency.trim()
      ? input.currency.trim().toUpperCase().slice(0, 8)
      : "USD";

  const notes =
    typeof input.notes === "string" && input.notes.trim() ? input.notes.trim().slice(0, 2000) : null;

  const number = pickNumber(input.number);

  const { data, error } = await ctx.supabase
    .from("invoices")
    .insert({
      user_id: ctx.userId,
      customer_id,
      number,
      status,
      due_date,
      currency,
      total_cents,
      notes,
    })
    .select("id,number,status,total_cents,currency,due_date,customer_id,created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        error: "invoice_number_conflict",
        message: `Invoice number "${number}" already exists. Retry with a different "number" or omit it for an auto-generated id.`,
      };
    }
    throw new Error(error.message);
  }

  try {
    await syncInvoiceEmbedding(ctx.supabase, ctx.userId, data.id as string);
  } catch {
    /* best-effort */
  }

  return {
    created: true,
    invoice: data,
    resolution_note,
  };
}

function pickCustomerName(input: Record<string, unknown>): string | null {
  const keys = ["name", "customer_name", "company_name", "client_name"] as const;
  for (const k of keys) {
    const v = input[k];
    if (typeof v === "string" && v.trim()) {
      return v.trim().slice(0, 200);
    }
  }
  return null;
}

function pickCustomerEmail(input: Record<string, unknown>): string | null {
  const v = input.email;
  if (typeof v !== "string" || !v.trim()) return null;
  const t = v.trim().slice(0, 255);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
    return null;
  }
  return t;
}

function pickCustomerNotes(input: Record<string, unknown>): string | null {
  const v = input.notes;
  if (typeof v !== "string" || !v.trim()) return null;
  return v.trim().slice(0, 2000);
}

async function createCustomer(ctx: ToolContext, input: Record<string, unknown>) {
  const name = pickCustomerName(input);
  if (!name) {
    return {
      error: "missing_name",
      message:
        'Pass "name" (or customer_name / company_name / client_name) with a non-empty string.',
    };
  }

  const rawEmail = typeof input.email === "string" ? input.email.trim() : "";
  const email = pickCustomerEmail(input);
  const emailWarning =
    rawEmail && !email ? "Provided email was not saved (invalid format)." : undefined;

  const notes = pickCustomerNotes(input);
  const phoneRaw = typeof input.phone === "string" ? input.phone.trim().slice(0, 40) : "";
  const phone = phoneRaw || null;

  const { data, error } = await ctx.supabase
    .from("customers")
    .insert({
      user_id: ctx.userId,
      name,
      email,
      phone,
      notes,
    })
    .select("id,name,email,phone,notes,created_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  try {
    await syncCustomerEmbedding(ctx.supabase, ctx.userId, data.id as string);
  } catch {
    /* best-effort */
  }

  return {
    created: true,
    customer: data,
    ...(emailWarning ? { warning: emailWarning } : {}),
  };
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

async function listExpenses(ctx: ToolContext, input: Record<string, unknown>) {
  const lim = Number(input.limit);
  const limit = Number.isFinite(lim) ? Math.min(50, Math.max(1, Math.round(lim))) : 25;

  const { data, error } = await ctx.supabase
    .from("expenses")
    .select(
      "id,amount_cents,currency,spent_at,category,merchant,description,source,created_at,receipt_storage_path"
    )
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return { expenses: data ?? [] };
}

async function createExpense(ctx: ToolContext, input: Record<string, unknown>) {
  const amount_cents = pickExpenseCentsFromBody({
    amount_cents: typeof input.amount_cents === "number" ? input.amount_cents : undefined,
    total_cents: typeof input.total_cents === "number" ? input.total_cents : undefined,
    amount_dollars: (input.amount_dollars ?? input.total_dollars ?? input.amount) as string | number | undefined,
    amount: typeof input.amount === "string" ? input.amount : undefined,
  });
  if (amount_cents === null) {
    return {
      error: "missing_amount",
      message:
        "Pass amount_cents (integer) or amount_dollars / amount (number or string like 24.50).",
    };
  }

  let spent_at = todayISODate();
  const due = input.spent_at ?? input.date;
  if (typeof due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(due.trim())) {
    spent_at = due.trim();
  }

  const currency =
    typeof input.currency === "string" && input.currency.trim()
      ? input.currency.trim().toUpperCase().slice(0, 8)
      : "USD";

  const category =
    typeof input.category === "string" && input.category.trim()
      ? input.category.trim().slice(0, 120)
      : null;
  const merchant =
    typeof input.merchant === "string" && input.merchant.trim()
      ? input.merchant.trim().slice(0, 200)
      : null;
  const description =
    typeof input.description === "string" && input.description.trim()
      ? input.description.trim().slice(0, 2000)
      : null;

  let receipt_storage_path: string | null = null;
  const pathRaw = input.receipt_storage_path;
  if (typeof pathRaw === "string" && pathRaw.trim()) {
    const p = pathRaw.trim();
    if (!p.startsWith(`${ctx.userId}/`)) {
      return {
        error: "invalid_receipt_path",
        message: "receipt_storage_path must be a path returned from this chat session upload.",
      };
    }
    receipt_storage_path = p;
  }

  let source: "chat_text" | "chat_receipt" | "manual" = "chat_text";
  const s = String(input.source ?? "").trim();
  if (s === "chat_receipt" || s === "manual" || s === "chat_text") {
    source = s;
  }
  if (receipt_storage_path && source === "chat_text") {
    source = "chat_receipt";
  }

  const { data, error } = await ctx.supabase
    .from("expenses")
    .insert({
      user_id: ctx.userId,
      amount_cents,
      currency,
      spent_at,
      category,
      merchant,
      description,
      receipt_storage_path,
      source,
    })
    .select("id,amount_cents,currency,spent_at,category,merchant,description,source,created_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return { created: true, expense: data };
}
