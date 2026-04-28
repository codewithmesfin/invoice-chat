/**
 * Supports standard Supabase env names and Lovable-style publishable keys.
 * If auth still fails, use the JWT `anon` key from Supabase Dashboard → Settings → API.
 */
export function getSupabasePublicEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    (process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID?.trim()
      ? `https://${process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID.trim()}.supabase.co`
      : undefined);

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  return { url, key };
}

export function assertSupabasePublicEnv(): { url: string; key: string } {
  const { url, key } = getSupabasePublicEnv();
  if (!url || !key) {
    throw new Error(
      "Missing Supabase URL or key. Set NEXT_PUBLIC_SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_PROJECT_ID) and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)."
    );
  }
  return { url, key };
}
