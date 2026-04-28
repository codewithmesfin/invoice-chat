import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { syncCustomerEmbedding } from "@/lib/embeddings/sync-entity";

const PostSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().max(255).optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Please sign in again to view your clients." },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("customers")
    .select("id,name,email,notes,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        message: "We couldn’t load your clients. Check your connection or try again in a moment.",
      },
      { status: 500 }
    );
  }
  return NextResponse.json({ customers: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Please sign in again to add a client." },
      { status: 401 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "We couldn’t read that request. Try closing and reopening the form." },
      { status: 400 }
    );
  }

  const parsed = PostSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_failed",
        message:
          "Check the name (required, up to 200 characters) and email format, then try again.",
      },
      { status: 400 }
    );
  }

  const { name, email, notes } = parsed.data;
  const emailTrim = email?.trim();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      user_id: user.id,
      name,
      email: emailTrim ? emailTrim : null,
      notes: notes ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      {
        error: error?.message ?? "insert_failed",
        message: "We couldn’t save this client. Check your connection and try again.",
      },
      { status: 500 }
    );
  }

  try {
    await syncCustomerEmbedding(supabase, user.id, data.id);
  } catch {
    /* embedding sync best-effort */
  }

  return NextResponse.json({ id: data.id });
}
