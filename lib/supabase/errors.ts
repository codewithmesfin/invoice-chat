/** PostgREST: table missing from schema cache (migration not applied or reload needed). */
export function isMissingTableError(message?: string | null) {
  if (!message) return false;
  return /schema cache|not find the table|PGRST205/i.test(message);
}

export const SCHEMA_FIX_HINT =
  "Apply SQL in Supabase → SQL Editor: supabase/migrations/20250427000000_agent_invoicing.sql " +
  "If tables already exist partially, also run: supabase/migrations/20250427120000_patch_agent_tables_if_missing.sql";
