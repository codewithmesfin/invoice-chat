import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: payments, error: pErr }, { data: emails, error: eErr }] = await Promise.all([
    supabase
      .from("invoice_payment_events")
      .select("id,event_type,stripe_event_id,created_at,payload")
      .eq("invoice_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoice_email_events")
      .select("id,kind,to_email,provider_message_id,created_at")
      .eq("invoice_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

  type Row = {
    id: string;
    at: string;
    kind: "payment" | "email";
    label: string;
    detail?: string | null;
  };

  const rows: Row[] = [];
  for (const p of payments ?? []) {
    rows.push({
      id: p.id,
      at: p.created_at,
      kind: "payment",
      label: p.event_type,
      detail: p.stripe_event_id,
    });
  }
  for (const e of emails ?? []) {
    rows.push({
      id: e.id,
      at: e.created_at,
      kind: "email",
      label: e.kind === "reminder" ? "Reminder sent" : "Invoice email sent",
      detail: e.to_email,
    });
  }
  rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return NextResponse.json({ timeline: rows });
}
