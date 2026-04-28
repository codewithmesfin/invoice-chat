/**
 * Maps API responses to short, human-friendly copy for mobile UI.
 * Prefer server-provided `message` when present.
 */

export type ApiErrorBody = {
  error?: string;
  message?: string;
  hint?: string;
};

export async function parseJsonSafe(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function friendlyUserMessage(
  status: number,
  body: ApiErrorBody | null,
  fallback: string
): string {
  if (body && typeof body.message === "string" && body.message.trim()) {
    return body.message.trim();
  }
  if (body?.hint && typeof body.hint === "string" && body.hint.trim()) {
    return body.hint.trim();
  }

  if (status === 401) {
    return "Your session expired. Please sign in again.";
  }
  if (status === 403) {
    return "You don’t have permission to do that.";
  }
  if (status === 404) {
    return "We couldn’t find that. It may have been removed.";
  }
  if (status === 408 || status === 504) {
    return "That took too long. Check your connection and try again.";
  }
  if (status === 429) {
    return "Too many requests. Wait a moment and try again.";
  }
  if (status >= 500) {
    return "Something went wrong on our side. Try again in a minute.";
  }
  if (status === 400) {
    return "We couldn’t process that request. Check your input and try again.";
  }

  return fallback;
}

export function chatFriendlyError(status: number, body: ApiErrorBody | null): string {
  if (body?.message?.trim()) {
    const hint = body.hint?.trim();
    const msg = body.message.trim();
    if (hint && !msg.includes(hint)) return `${msg}\n\n${hint}`;
    return msg;
  }
  if (body?.hint?.trim()) return body.hint.trim();

  const raw = body?.error?.toLowerCase() ?? "";
  if (raw.includes("unauthorized") || status === 401) {
    return "Please sign in again, then reopen chat.";
  }
  if (status === 429) {
    return "The assistant is busy. Wait a few seconds and tap Retry.";
  }
  if (status === 503 || raw.includes("bucket") || raw.includes("schema")) {
    return friendlyUserMessage(
      status,
      body,
      "Service is temporarily unavailable. Try again in a moment or check your workspace setup."
    );
  }
  if (status >= 500) {
    return "The assistant hit a server error. Your message is still there — tap Retry, or try again shortly.";
  }
  return friendlyUserMessage(
    status,
    body,
    "We couldn’t get a reply. Check your connection and tap Retry."
  );
}
