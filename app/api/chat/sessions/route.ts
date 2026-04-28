import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError, SCHEMA_FIX_HINT } from "@/lib/supabase/errors";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Please sign in again to view chat history." },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, title, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    const status = isMissingTableError(error.message) ? 503 : 500;
    return NextResponse.json(
      {
        error: error.message,
        message: isMissingTableError(error.message)
          ? "Chat tables are not available in this project yet."
          : "We couldn’t load your conversations.",
        ...(isMissingTableError(error.message) ? { hint: SCHEMA_FIX_HINT } : {}),
      },
      { status }
    );
  }

  return NextResponse.json({ sessions: data ?? [] });
}
