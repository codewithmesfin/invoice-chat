import { createBrowserClient } from "@supabase/ssr";
import { assertSupabasePublicEnv } from "@/lib/supabase/env";

export function createClient() {
  const { url, key } = assertSupabasePublicEnv();
  return createBrowserClient(url, key);
}
