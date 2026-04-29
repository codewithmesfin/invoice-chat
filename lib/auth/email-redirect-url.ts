/** Path Supabase redirects to after the user confirms their email (PKCE code exchange). */
export const AUTH_EMAIL_CALLBACK_PATH = "/auth/callback";

/**
 * Full URL for `signUp` → `options.emailRedirectTo`.
 * Uses `window.location.origin` in the browser so confirmation links always match
 * the site the user is on (production domain, Vercel preview, or localhost)—not a
 * baked-in build default that might still point at localhost in production.
 */
export function getAuthEmailRedirectUrl(): string {
  if (typeof window !== "undefined") {
    return new URL(AUTH_EMAIL_CALLBACK_PATH, window.location.origin).href;
  }
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (base) {
    return new URL(AUTH_EMAIL_CALLBACK_PATH, base).href;
  }
  return "";
}
