/**
 * Apply SQL migrations directly to Postgres (bypasses the SQL Editor UI).
 *
 * 1) Supabase Dashboard → Project Settings → Database
 * 2) Copy "Connection string" → URI (use "Direct connection" or pooler; include password)
 * 3) Add to .env:  DIRECT_URL=postgresql://postgres.[ref]:[PASSWORD]@...
 * 4) Run: npm run db:apply
 *
 * Uses SSL (required by Supabase). Re-run is only safe for idempotent parts;
 * if the base migration already partially applied, fix errors in Dashboard SQL
 * or run only the patch file manually.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error(
    "Missing DIRECT_URL or DATABASE_URL in .env.\n" +
      "Supabase → Project Settings → Database → copy the Postgres URI (with password)."
  );
  process.exit(1);
}

const files = [
  path.join(root, "supabase/migrations/20250427000000_agent_invoicing.sql"),
  path.join(root, "supabase/migrations/20250427120000_patch_agent_tables_if_missing.sql"),
];

const client = new pg.Client({
  connectionString: url,
  ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
});

await client.connect();
console.log("Connected. Applying migrations…\n");

for (const file of files) {
  const sql = fs.readFileSync(file, "utf8");
  console.log("→", path.relative(root, file));
  try {
    await client.query(sql);
    console.log("  OK\n");
  } catch (e) {
    console.error("  FAILED:", e.message);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log("Done. If the REST API still misses tables, run in SQL Editor: NOTIFY pgrst, 'reload schema';");
console.log("Then: npm run verify");
