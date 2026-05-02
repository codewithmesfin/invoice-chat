import { assertAppUrl } from "@/lib/stripe/server";

/** Path after origin — same host resolution as Stripe / invoice (`assertAppUrl`). */
export const AUTH_EMAIL_CALLBACK_PATH = "/auth/callback";

/**
 * Full `emailRedirectTo` for Supabase sign-up. Uses **`assertAppUrl(request)`** — the
 * same helper as payment checkout, invoice emails, and reminders (`lib/stripe/server`).
 */
export function resolveAuthEmailRedirectUrl(request: Request): string {
  try {
    const base = assertAppUrl(request).replace(/\/$/, "");
    return new URL(AUTH_EMAIL_CALLBACK_PATH, base).href;
  } catch {
    return "";
  }
}
