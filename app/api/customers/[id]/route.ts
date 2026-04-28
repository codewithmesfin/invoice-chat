import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    .select("id,name,email,notes,created_at")
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
