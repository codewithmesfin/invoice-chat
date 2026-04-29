import type { AuthError } from "@supabase/supabase-js";

const GENERIC_SIGN_IN =
  "We couldn’t sign you in. Check your email and password, then try again.";
const GENERIC_SIGN_UP =
  "We couldn’t create your account. Check your details and try again.";

function normalize(msg: string) {
  return msg.toLowerCase().trim();
}

/**
 * Maps Supabase Auth errors to clearer, user-facing copy.
 */
export function friendlySignInError(error: AuthError | Pick<AuthError, "message" | "status">): string {
  const raw = error.message?.trim() || "";
  const m = normalize(raw);

  if (m.includes("invalid login credentials") || m.includes("invalid credentials")) {
    return "That email or password doesn’t match our records. Try again, or create an account if you’re new.";
  }
  if (m.includes("email not confirmed") || m.includes("not confirmed")) {
    return "Confirm your email first. Open the link we sent you, then sign in here.";
  }
  if (m.includes("too many requests") || m.includes("rate limit") || error.status === 429) {
    return "Too many sign-in attempts. Wait a minute, then try again.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Connection problem. Check your internet and try again.";
  }
  if (raw) return raw;
  return GENERIC_SIGN_IN;
}

export function friendlySignUpError(error: AuthError | Pick<AuthError, "message" | "status">): string {
  const raw = error.message?.trim() || "";
  const m = normalize(raw);

  if (m.includes("user already registered") || m.includes("already been registered")) {
    return "An account with this email already exists. Sign in instead, or use a different email.";
  }
  if (m.includes("password") && (m.includes("at least") || m.includes("least 6"))) {
    return "Use a password with at least 6 characters.";
  }
  if (m.includes("invalid email") || m.includes("unable to validate email")) {
    return "That doesn’t look like a valid email address. Check for typos and try again.";
  }
  if (m.includes("signup is disabled") || m.includes("signups not allowed")) {
    return "New sign-ups are disabled for this app. Contact support if you need access.";
  }
  if (m.includes("too many requests") || m.includes("rate limit") || error.status === 429) {
    return "Too many attempts. Wait a minute, then try again.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Connection problem. Check your internet and try again.";
  }
  if (raw) return raw;
  return GENERIC_SIGN_UP;
}
