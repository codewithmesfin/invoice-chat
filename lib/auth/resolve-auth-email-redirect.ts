import { publicUrlFromRequest, resolvePublicAppUrl } from "@/lib/app/public-url";

export const AUTH_EMAIL_CALLBACK_PATH = "/auth/callback";

function looksLikeLocalhostOrigin(origin: string): boolean {
  try {
    const h = new URL(origin).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h.endsWith(".localhost");
  } catch {
    return /localhost|127\.0\.0\.1/i.test(origin);
  }
}

function originFromRequestMetadata(request: Request): string | null {
  const origin = request.headers.get("origin")?.trim();
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      /* ignore */
    }
  }
  const referer = request.headers.get("referer")?.trim();
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Full `emailRedirectTo` for Supabase sign-up confirmation emails.
 * Resolves on the **server** from the incoming signup request so production never
 * depends on `NEXT_PUBLIC_APP_URL` baked at build time or a wrong client origin.
 *
 * Order: non-localhost **Host / x-forwarded-*** (so prod is never overridden by a
 * wrong `APP_URL` / `NEXT_PUBLIC_APP_URL`), then `resolvePublicAppUrl`, then
 * `Origin` / `Referer`, then `request.url` origin.
 */
export function resolveAuthEmailRedirectUrl(request: Request): string {
  const fromForwardedHost = publicUrlFromRequest(request);
  if (fromForwardedHost && !looksLikeLocalhostOrigin(fromForwardedHost)) {
    return new URL(AUTH_EMAIL_CALLBACK_PATH, fromForwardedHost.replace(/\/$/, "")).href;
  }

  const fromResolver = resolvePublicAppUrl({ request });
  const base =
    (fromResolver && fromResolver.replace(/\/$/, "")) ||
    originFromRequestMetadata(request)?.replace(/\/$/, "") ||
    (() => {
      try {
        return new URL(request.url).origin.replace(/\/$/, "");
      } catch {
        return "";
      }
    })();

  if (!base) return "";
  return new URL(AUTH_EMAIL_CALLBACK_PATH, base).href;
}
