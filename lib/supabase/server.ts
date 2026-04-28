import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertSupabasePublicEnv } from "@/lib/supabase/env";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = assertSupabasePublicEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options as never)
          );
        } catch {
          /* Server Component */
        }
      },
    },
  });
}
