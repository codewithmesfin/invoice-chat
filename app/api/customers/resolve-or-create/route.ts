import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { syncCustomerEmbedding } from "@/lib/embeddings/sync-entity";

const BodySchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().max(255).optional(),
  phone: z.string().max(40).optional(),
});

/** Case-fold exact match on name within this user's customers (SMB-sized list). */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Please sign in again to continue." },
      { status: 401 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", message: "Client name is required (up to 200 characters)." },
      { status: 400 }
    );
  }

  const nameTrim = parsed.data.name.trim();
  const emailRaw = parsed.data.email?.trim();
  const phoneRaw = parsed.data.phone?.trim();
  if (emailRaw && !z.string().email().safeParse(emailRaw).success) {
    return NextResponse.json(
      { error: "invalid_email", message: "That email doesn’t look valid. Check for typos." },
      { status: 400 }
    );
  }

  const { data: rows, error } = await supabase
    .from("customers")
    .select("id,name,email,phone")
    .eq("user_id", user.id)
    .limit(3000);

  if (error) {
    return NextResponse.json(
      { error: error.message, message: "We couldn’t look up your clients. Try again." },
      { status: 500 }
    );
  }

  const needle = nameTrim.toLowerCase();
  const matches = (rows ?? []).filter((r) => (r.name as string).trim().toLowerCase() === needle);

  if (matches.length > 1) {
    return NextResponse.json(
      {
        error: "ambiguous_name",
        message: "More than one client uses this exact name. Pick one from your client list instead.",
        customers: matches.map((r) => ({
          id: r.id as string,
          name: r.name as string,
          email: (r.email as string | null) ?? null,
          phone: (r.phone as string | null) ?? null,
        })),
      },
      { status: 409 }
    );
  }

  if (matches.length === 1) {
    const row = matches[0] as {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
    };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (emailRaw) patch.email = emailRaw;
    if (phoneRaw) patch.phone = phoneRaw;

    if (emailRaw || phoneRaw) {
      const { data: updated, error: upErr } = await supabase
        .from("customers")
        .update(patch)
        .eq("id", row.id)
        .eq("user_id", user.id)
        .select("id,name,email,phone")
        .maybeSingle();

      if (upErr) {
        return NextResponse.json(
          { error: upErr.message, message: "We couldn’t update this client." },
          { status: 500 }
        );
      }
      if (updated) {
        try {
          await syncCustomerEmbedding(supabase, user.id, row.id);
        } catch {
          /* best-effort */
        }
        return NextResponse.json({
          created: false,
          customer: updated,
        });
      }
    }

    return NextResponse.json({
      created: false,
      customer: row,
    });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("customers")
    .insert({
      user_id: user.id,
      name: nameTrim,
      email: emailRaw || null,
      phone: phoneRaw || null,
      notes: null,
    })
    .select("id,name,email,phone")
    .single();

  if (insErr || !inserted) {
    return NextResponse.json(
      {
        error: insErr?.message ?? "insert_failed",
        message: "We couldn’t create this client. Try again.",
      },
      { status: 500 }
    );
  }

  try {
    await syncCustomerEmbedding(supabase, user.id, inserted.id as string);
  } catch {
    /* best-effort */
  }

  return NextResponse.json({
    created: true,
    customer: inserted,
  });
}
