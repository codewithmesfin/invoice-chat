import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { syncCustomerEmbedding } from "@/lib/embeddings/sync-entity";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Please sign in again to view this client." },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("customers")
    .select("id,name,email,phone,notes,created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        message: "We couldn’t load this client. Try again in a moment.",
      },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "not_found", message: "This client isn’t here anymore — it may have been removed." },
      { status: 404 }
    );
  }

  return NextResponse.json({ customer: data });
}

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.union([z.string().max(255), z.literal("")]).optional(),
  phone: z.union([z.string().max(40), z.literal("")]).optional(),
  notes: z.union([z.string().max(2000), z.literal("")]).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Please sign in again to update this client." },
      { status: 401 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "We couldn’t read that update." },
      { status: 400 }
    );
  }

  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", message: "Check field lengths and try again." },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.email !== undefined) patch.email = parsed.data.email.trim() ? parsed.data.email.trim() : null;
  if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone.trim() ? parsed.data.phone.trim() : null;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes.trim() ? parsed.data.notes.trim() : null;

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "validation_failed", message: "No changes to save." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("customers")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id,name,email,phone,notes,created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message, message: "We couldn’t update this client." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "not_found", message: "This client isn’t available." },
      { status: 404 }
    );
  }

  try {
    await syncCustomerEmbedding(supabase, user.id, id);
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ customer: data });
}
