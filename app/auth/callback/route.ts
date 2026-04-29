import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextRaw = url.searchParams.get("next") ?? "/chat";
  const errParam = url.searchParams.get("error");
  const errDesc = url.searchParams.get("error_description");

  const next =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/chat";

  const toLogin = (message: string) =>
    NextResponse.redirect(
      `${url.origin}/login?auth_error=${encodeURIComponent(message)}`
    );

  if (errParam) {
    const msg = (errDesc || errParam).replace(/\+/g, " ");
    return toLogin(msg);
  }

  if (!code) {
    return toLogin("That confirmation link is incomplete. Try signing in, or sign up again.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return toLogin(error.message);
  }

  return NextResponse.redirect(`${url.origin}${next}`);
}
