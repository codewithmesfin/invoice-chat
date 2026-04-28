import { createClient } from "@supabase/supabase-js";
import { assertSupabasePublicEnv } from "@/lib/supabase/env";

/** True when pay links, webhooks, and storage uploads can use the service role on the server. */
export function hasServiceRoleKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/**
 * Service-role client for privileged server tasks (e.g. pay-return sync, storage). Never import in Client Components.
 */
export function createAdminClient() {
  const { url } = assertSupabasePublicEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for server-side operations.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
