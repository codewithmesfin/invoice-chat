import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { pickExpenseCentsFromBody } from "@/lib/expenses/parse-amount";
import { isMissingTableError, SCHEMA_FIX_HINT } from "@/lib/supabase/errors";

const PostSchema = z.object({
  amount: z.string().optional(),
  amount_cents: z.number().int().min(0).optional(),
  amount_dollars: z.union([z.string(), z.number()]).optional(),
  currency: z.string().min(1).max(8).default("USD"),
  spent_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: z.string().max(120).nullable().optional(),
  merchant: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  receipt_storage_path: z.string().max(500).nullable().optional(),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Please sign in again to view expenses." },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("expenses")
    .select(
      "id,amount_cents,currency,spent_at,category,merchant,description,receipt_storage_path,source,created_at"
    )
    .order("spent_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        message: isMissingTableError(error.message)
          ? "Expenses table isn’t available yet."
          : "We couldn’t load expenses.",
        ...(isMissingTableError(error.message) ? { hint: SCHEMA_FIX_HINT } : {}),
      },
      { status: isMissingTableError(error.message) ? 503 : 500 }
    );
  }
  return NextResponse.json({ expenses: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Please sign in again to log an expense." },
      { status: 401 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "We couldn’t read that request." },
      { status: 400 }
    );
  }

  const parsed = PostSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_failed",
        message: "Check amount, date (YYYY-MM-DD), and field lengths, then try again.",
      },
      { status: 400 }
    );
  }

  const row = parsed.data;
  const spent_at = row.spent_at ?? new Date().toISOString().slice(0, 10);
  const amount_cents = pickExpenseCentsFromBody({
    amount_cents: row.amount_cents,
    amount: row.amount ?? null,
    amount_dollars: row.amount_dollars ?? null,
  });
  if (amount_cents === null) {
    return NextResponse.json(
      {
        error: "missing_amount",
        message: "Enter an amount (for example 24.50) or amount in cents.",
      },
      { status: 400 }
    );
  }

  const currency = row.currency.trim().toUpperCase().slice(0, 8);
  const category = row.category?.trim() ? row.category.trim().slice(0, 120) : null;
  const merchant = row.merchant?.trim() ? row.merchant.trim().slice(0, 200) : null;
  const description = row.description?.trim() ? row.description.trim().slice(0, 2000) : null;

  let receipt_storage_path: string | null = null;
  const p = row.receipt_storage_path?.trim();
  if (p) {
    if (!p.startsWith(`${user.id}/`)) {
      return NextResponse.json(
        {
          error: "invalid_receipt_path",
          message: "Receipt must be uploaded from this app for your account.",
        },
        { status: 400 }
      );
    }
    receipt_storage_path = p;
  }

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      user_id: user.id,
      amount_cents,
      currency,
      spent_at,
      category,
      merchant,
      description,
      receipt_storage_path,
      source: "manual",
    })
    .select("id,amount_cents,currency,spent_at,category,merchant,description,source,created_at,receipt_storage_path")
    .single();

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        message: "We couldn’t save this expense. Check your connection and try again.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ expense: data });
}
