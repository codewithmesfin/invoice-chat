/**
 * Resolves the browser-facing origin for pay links, Stripe redirects, and emails.
 * In production, never trust NEXT_PUBLIC_APP_URL if it still points at localhost:
 * use the incoming request host (Vercel/custom domain) or APP_URL / VERCEL_URL.
 */

function stripOrigin(url: string): string {
  const t = url.trim().replace(/\/$/, "");
  if (!t) return t;
  if (t.startsWith("http://") || t.startsWith("https://")) {
    try {
      return new URL(t).origin;
    } catch {
      return t;
    }
  }
  try {
    return new URL(`https://${t}`).origin;
  } catch {
    return t;
  }
}

function looksLikeLocalhost(urlish: string): boolean {
  try {
    const u = urlish.includes("://") ? new URL(urlish) : new URL(`http://${urlish.split("/")[0]}`);
    const h = u.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h.endsWith(".localhost");
  } catch {
    return /localhost|127\.0\.0\.1/i.test(urlish);
  }
}

/** Origin from the active HTTP request (Host / X-Forwarded-*). */
export function publicUrlFromRequest(req: Request): string | null {
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host")?.trim();
  if (!host) return null;

  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    forwardedProto ||
    (looksLikeLocalhost(host) ? "http" : "https");

  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return null;
  }
}

/**
 * Resolves public site origin. Pass `request` from API route handlers so pay links
 * match the domain the user is on (custom domain, Vercel preview, etc.).
 */
export function resolvePublicAppUrl(opts?: { request?: Request }): string | null {
  const req = opts?.request;

  const serverCanonical = process.env.APP_URL?.trim() || process.env.SERVER_APP_URL?.trim();
  if (serverCanonical) {
    return stripOrigin(serverCanonical);
  }

  const fromReq = req ? publicUrlFromRequest(req) : null;
  if (fromReq && !looksLikeLocalhost(fromReq)) {
    return fromReq;
  }

  const nextRaw = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  const isProd =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    !!process.env.RAILWAY_ENVIRONMENT ||
    !!process.env.RENDER;

  if (nextRaw && !(isProd && looksLikeLocalhost(nextRaw))) {
    return stripOrigin(nextRaw);
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "");
    return stripOrigin(`https://${host}`);
  }

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) {
    const host = railway.replace(/^https?:\/\//, "");
    return stripOrigin(`https://${host}`);
  }

  const render = process.env.RENDER_EXTERNAL_URL?.trim();
  if (render) {
    try {
      return new URL(render).origin;
    } catch {
      /* ignore */
    }
  }

  if (nextRaw) {
    return stripOrigin(nextRaw);
  }

  if (fromReq) {
    return fromReq;
  }

  return null;
}

export function assertAppUrl(request?: Request): string {
  const base = resolvePublicAppUrl({ request });
  if (!base) {
    throw new Error(
      "Could not determine the public app URL. Set APP_URL or NEXT_PUBLIC_APP_URL to your live site (e.g. https://yourdomain.com). On Vercel, VERCEL_URL is used automatically when NEXT_PUBLIC_APP_URL still points to localhost."
    );
  }
  return base;
}
