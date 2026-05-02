import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { resolveAuthEmailRedirectUrl } from "@/lib/auth/resolve-auth-email-redirect";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

const BodySchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(6).max(128),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Invalid request body." },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_failed",
        message: "Enter a valid email and a password with at least 6 characters.",
      },
      { status: 400 }
    );
  }

  const emailRedirectTo = resolveAuthEmailRedirectUrl(request);
  if (!emailRedirectTo) {
    return NextResponse.json(
      {
        error: "missing_public_url",
        message:
          "Could not determine your site URL for the confirmation email. Set APP_URL to your live origin (e.g. https://yourdomain.com).",
      },
      { status: 503 }
    );
  }

  const { url, key } = getSupabasePublicEnv();
  if (!url || !key) {
    return NextResponse.json(
      {
        error: "misconfigured",
        message: "Authentication is not configured on this server.",
      },
      { status: 503 }
    );
  }

  const supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
       emailRedirectTo
       },
  });

  if (error) {
    const status =
      typeof error.status === "number" && error.status >= 400 && error.status < 600
        ? error.status
        : 400;
    return NextResponse.json({ error: error.name, message: error.message }, { status });
  }

  return NextResponse.json({ ok: true });
}
