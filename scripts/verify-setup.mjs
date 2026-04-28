/**
 * Smoke-test OpenRouter + Supabase schema + optional authenticated flows.
 * Run: npm run verify
 *
 * Optional: E2E_EMAIL + E2E_PASSWORD — sign-in, CRUD customer, chat session + message.
 * Optional: VERIFY_APP_URL (default http://localhost:3000) — GET /login.
 */
import { createClient } from "@supabase/supabase-js";

const REQUIRED_TABLES = [
  "customers",
  "invoices",
  "invoice_line_items",
  "chat_sessions",
  "chat_messages",
  "memories",
];

function getSupabasePublicEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    (process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID?.trim()
      ? `https://${process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID.trim()}.supabase.co`
      : "");
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ""
  ).trim();
  return { url, key };
}

function fail(msg, detail) {
  console.error("FAIL:", msg, detail ?? "");
  process.exit(1);
}

function isMissingTable(msg) {
  return /schema cache|not find the table|PGRST205/i.test(msg || "");
}

function isPublishableStyleKey(k) {
  return typeof k === "string" && k.startsWith("sb_publishable_");
}

/** Raw PostgREST probe (same host as supabase-js). */
async function restProbeCustomers(projectUrl, apiKey) {
  const u = projectUrl.replace(/\/$/, "");
  const res = await fetch(`${u}/rest/v1/customers?select=id&limit=1`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json };
}

const { url, key } = getSupabasePublicEnv();
if (!url || !key) fail("Missing Supabase URL or anon/publishable key");

console.log("OK: Supabase public env");
if (isPublishableStyleKey(key)) {
  console.warn(
    "NOTE: Using sb_publishable_ key — PostgREST accepts it here. If you later see HTTP 401 from Supabase,\n" +
      "set NEXT_PUBLIC_SUPABASE_ANON_KEY to the JWT **anon** key (starts with eyJ) from Dashboard → Settings → API.\n"
  );
}

const orKey = process.env.OPENROUTER_API_KEY?.trim();
if (!orKey) fail("Missing OPENROUTER_API_KEY");

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
const embModel =
  process.env.OPENROUTER_EMBEDDING_MODEL?.trim() ||
  "nvidia/llama-nemotron-embed-vl-1b-v2:free";

const embRes = await fetch("https://openrouter.ai/api/v1/embeddings", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${orKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": appUrl,
    "X-Title": "Invoicing Verify",
  },
  body: JSON.stringify({ model: embModel, input: "connectivity check" }),
});

if (!embRes.ok) fail("OpenRouter embeddings", `${embRes.status} ${await embRes.text()}`);
const embJson = await embRes.json();
const dim = embJson?.data?.[0]?.embedding?.length;
if (!dim) fail("OpenRouter embeddings empty vector");
console.log("OK: OpenRouter embeddings", { model: embModel, dim });
if (dim !== 2048) {
  console.warn("WARN: embedding dim is", dim, "(migration uses vector(2048))");
}

const chatCandidates = [
  process.env.OPENROUTER_CHAT_MODEL?.trim(),
  "meta-llama/llama-3.2-3b-instruct:free",
  "mistralai/mistral-7b-instruct:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "openrouter/auto",
].filter(Boolean);

const seen = new Set();
const models = chatCandidates.filter((m) => {
  if (seen.has(m)) return false;
  seen.add(m);
  return true;
});

let chatOk = false;
let lastChatErr = "";
for (const model of models) {
  const chatRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${orKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": appUrl,
      "X-Title": "Invoicing Verify",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with exactly: pong" }],
      max_tokens: 16,
      temperature: 0,
    }),
  });

  if (chatRes.ok) {
    const chatJson = await chatRes.json();
    const content = chatJson?.choices?.[0]?.message?.content;
    if (content) {
      console.log("OK: OpenRouter chat", { model });
      chatOk = true;
      break;
    }
    lastChatErr = "empty content";
    continue;
  }

  const body = await chatRes.text();
  lastChatErr = `${chatRes.status} ${body}`;
  if ([429, 503, 404].includes(chatRes.status)) {
    console.warn("WARN: chat model unavailable, trying fallback:", model, chatRes.status);
    continue;
  }
  fail("OpenRouter chat", lastChatErr);
}

if (!chatOk) {
  console.error("FAIL: OpenRouter chat (all candidate models failed). Last:", lastChatErr);
  process.exit(1);
}

const sbAnon = createClient(url, key);

for (const table of REQUIRED_TABLES) {
  const { error } = await sbAnon.from(table).select("id").limit(1);
  if (error) {
    const meta = [
      error.message && `message: ${error.message}`,
      error.code && `code: ${error.code}`,
      error.details && `details: ${error.details}`,
      error.hint && `hint: ${error.hint}`,
    ]
      .filter(Boolean)
      .join("\n    ");
    console.error(`\nSupabase probe "${table}" failed:\n    ${meta || "(no details)"}`);

    if (isMissingTable(error.message)) {
      const raw = await restProbeCustomers(url, key);
      console.error(
        `\nRaw REST GET /rest/v1/customers?select=id&limit=1 → HTTP ${raw.status}`,
        "\nBody:",
        JSON.stringify(raw.json).slice(0, 800)
      );

      console.error(`\nFAIL: table "${table}" is not visible to PostgREST (missing table or stale schema cache).`);
      if (raw.status === 401 || raw.status === 403) {
        console.error(
          "The API key was rejected or forbidden. Use the Supabase **anon** JWT (eyJ...) from Dashboard → API, not a third-party publishable string unless your host documents it.\n"
        );
      } else {
        console.error(
          "1) Supabase → SQL Editor → run (in order if needed):\n" +
            "   supabase/migrations/20250427000000_agent_invoicing.sql\n" +
            "   supabase/migrations/20250427120000_patch_agent_tables_if_missing.sql\n" +
            "2) In Dashboard → Table Editor, confirm `customers` exists under schema `public`.\n" +
            "3) If the table exists, run in SQL Editor: NOTIFY pgrst, 'reload schema';\n"
        );
      }
      process.exit(1);
    }
    fail(`Supabase probe "${table}"`, error.message);
  }
  console.log(`OK: Supabase table exposed → ${table}`);
}

const email = process.env.E2E_EMAIL?.trim();
const password = process.env.E2E_PASSWORD?.trim();
if (email && password) {
  const { data: auth, error: aerr } = await sbAnon.auth.signInWithPassword({ email, password });
  if (aerr || !auth.user || !auth.session) fail("Supabase sign-in", aerr?.message);
  const uid = auth.user.id;

  const name = `verify_${Date.now()}`;
  const ins = await sbAnon.from("customers").insert({ user_id: uid, name }).select("id").single();
  if (ins.error) fail("Customer insert (RLS)", ins.error.message);
  console.log("OK: Authenticated customer insert");

  const sess = await sbAnon
    .from("chat_sessions")
    .insert({ user_id: uid, title: "verify" })
    .select("id")
    .single();
  if (sess.error) fail("chat_sessions insert", sess.error.message);
  console.log("OK: chat_sessions insert");

  const msg = await sbAnon.from("chat_messages").insert({
    session_id: sess.data.id,
    user_id: uid,
    role: "user",
    content: "verify message",
    metadata: {},
  });
  if (msg.error) fail("chat_messages insert", msg.error.message);
  console.log("OK: chat_messages insert");

  const delSess = await sbAnon.from("chat_sessions").delete().eq("id", sess.data.id);
  if (delSess.error) fail("chat_sessions delete", delSess.error.message);
  console.log("OK: chat_sessions delete (cascade)");

  const delCust = await sbAnon.from("customers").delete().eq("id", ins.data.id);
  if (delCust.error) fail("Customer delete", delCust.error.message);
  console.log("OK: customer cleanup");

  await sbAnon.auth.signOut();
} else {
  console.log(
    "SKIP: E2E_EMAIL + E2E_PASSWORD — set both in .env to test authenticated chat schema writes."
  );
}

const base = process.env.VERIFY_APP_URL?.trim() || "http://localhost:3000";
try {
  const r = await fetch(`${base}/login`, { signal: AbortSignal.timeout(8000) });
  console.log("OK: Next app", base, "GET /login →", r.status);
} catch (e) {
  console.log("SKIP: Next app not reachable at", base, "(" + (e?.message || e) + ")");
}

console.log("\nVERIFY: all automated checks passed.");
