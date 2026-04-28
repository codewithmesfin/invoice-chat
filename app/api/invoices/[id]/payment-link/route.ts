import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertAppUrl } from "@/lib/stripe/server";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let appBase: string;
  try {
    appBase = assertAppUrl();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "App URL not configured";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const { data: inv, error } = await supabase
    .from("invoices")
    .select("id,payment_share_token,status,total_cents")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (inv.status === "paid" || inv.status === "cancelled") {
    return NextResponse.json({ error: "Invoice cannot accept payments in this state." }, { status: 400 });
  }

  if (inv.total_cents < 50) {
    return NextResponse.json(
      { error: "Invoice total must be at least $0.50 (50 cents) to use card checkout." },
      { status: 400 }
    );
  }

  let token = inv.payment_share_token as string | null;
  if (!token) {
    token = randomBytes(24).toString("hex");
    const { error: upErr } = await supabase
      .from("invoices")
      .update({
        payment_share_token: token,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const url = `${appBase}/pay/${token}`;
  return NextResponse.json({ url, token });
}
