import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError, SCHEMA_FIX_HINT } from "@/lib/supabase/errors";

const PatchSchema = z.object({
  title: z.string().min(1).max(200).trim(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Please sign in again to open this chat." },
      { status: 401 }
    );
  }

  const { data: session, error: sErr } = await supabase
    .from("chat_sessions")
    .select("id, title, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (sErr) {
    const status = isMissingTableError(sErr.message) ? 503 : 500;
    return NextResponse.json(
      {
        error: sErr.message,
        message: isMissingTableError(sErr.message)
          ? "Chat storage isn’t set up yet."
          : "We couldn’t open this conversation.",
        ...(isMissingTableError(sErr.message) ? { hint: SCHEMA_FIX_HINT } : {}),
      },
      { status }
    );
  }

  if (!session) {
    return NextResponse.json(
      { error: "not_found", message: "This conversation no longer exists." },
      { status: 404 }
    );
  }

  const { data: messages, error: mErr } = await supabase
    .from("chat_messages")
    .select("id, role, content, metadata, created_at")
    .eq("session_id", id)
    .eq("user_id", user.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .limit(500);

  if (mErr) {
    return NextResponse.json(
      {
        error: mErr.message,
        message: "We couldn’t load messages for this conversation.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    session,
    messages: messages ?? [],
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Please sign in again to rename this chat." },
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
      { error: "validation_failed", message: "Title must be between 1 and 200 characters." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("chat_sessions")
    .update({ title: parsed.data.title, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, title, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message, message: "We couldn’t rename this conversation." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "not_found", message: "This conversation no longer exists." },
      { status: 404 }
    );
  }

  return NextResponse.json({ session: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Please sign in again to delete this chat." },
      { status: 401 }
    );
  }

  const { data: existing } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { error: "not_found", message: "This conversation was already removed." },
      { status: 404 }
    );
  }

  const { error } = await supabase.from("chat_sessions").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: error.message, message: "We couldn’t delete this conversation." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
