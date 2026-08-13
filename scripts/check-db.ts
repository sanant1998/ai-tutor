/* Does this database actually have what the app expects?
 *
 *   node --import ./scripts/register-alias.mjs scripts/check-db.ts
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * There are seven SQL files and they must be run in order — compliance.sql
 * replaces the trigger function from schema.sql, and billing.sql references a
 * table created by schools.sql. Run them in the wrong order and nothing errors
 * loudly: the app boots, most of it works, and the parts that do not fail in
 * ways that look like application bugs. A missing email trigger shows up weeks
 * later as "the roster import cannot find anyone".
 *
 * So this asks the database directly. It is the first thing to run after a
 * migration and the first thing to run when something inexplicable is
 * happening on a deployment.
 *
 * It checks presence, not correctness. A table that exists with the wrong
 * policy still passes here — RLS behaviour needs a real signed-in client to
 * test, which is a separate job this script deliberately does not pretend to
 * do. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(ROOT, file), "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* Not present. */
  }
}

/* Names the ONE that is missing, not the whole list.
 *
 * "Set A and B" when B is already set sends someone to check both, find A
 * present, and doubt whether the file is being read at all. A message that
 * names only what is absent is the difference between a five-second fix and a
 * ten-minute one. */
function missing(...names: string[]): string[] {
  return names.filter((name) => !process.env[name]);
}

function reportMissing(names: string[]): never {
  console.error("Missing from .env.local:");
  for (const name of names) console.error(`  ${name}`);

  if (names.includes("SUPABASE_SERVICE_ROLE_KEY")) {
    console.error("");
    console.error("The service-role key is in the Supabase dashboard under");
    console.error("  Project Settings -> API -> Project API keys -> service_role");
    console.error("");
    console.error("It bypasses row-level security, so: server-side only, never");
    console.error("committed, and never given a NEXT_PUBLIC_ prefix.");
  }

  process.exit(1);
}

type Check = { migration: string; table: string; column?: string };

/* In the order the files must be run. The first failure names the file to run,
   which is the whole point — "relation does not exist" does not. */
const CHECKS: Check[] = [
  { migration: "schema.sql", table: "profiles" },
  { migration: "schema.sql", table: "ai_usage" },
  { migration: "schema.sql", table: "attempts" },

  { migration: "tutor.sql", table: "subjects" },
  { migration: "tutor.sql", table: "concepts" },
  { migration: "tutor.sql", table: "bank_questions" },
  { migration: "tutor.sql", table: "learning_sessions" },
  { migration: "tutor.sql", table: "topic_mastery" },
  { migration: "tutor.sql", table: "llm_calls" },
  /* Added to the existing attempts table by tutor.sql. Its absence means
     tutor.sql ran against a database where schema.sql had not. */
  { migration: "tutor.sql", table: "attempts", column: "topic_ref" },

  { migration: "compliance.sql", table: "consents" },
  { migration: "compliance.sql", table: "otp_challenges" },
  { migration: "compliance.sql", table: "voice_blobs" },
  { migration: "compliance.sql", table: "profiles", column: "language" },
  { migration: "compliance.sql", table: "safety_flags" },
  { migration: "compliance.sql", table: "content_drafts" },
  /* The one that silently breaks the roster import if compliance.sql was run
     before schema.sql, or not at all. */
  { migration: "compliance.sql", table: "profiles", column: "email" },
  { migration: "compliance.sql", table: "profiles", column: "dob" },

  { migration: "schools.sql", table: "orgs" },
  { migration: "schools.sql", table: "sections" },
  { migration: "schools.sql", table: "assignments" },

  { migration: "billing.sql", table: "subscriptions" },
  { migration: "billing.sql", table: "invoices" },
  { migration: "billing.sql", table: "billing_events" },

  { migration: "ratelimit.sql", table: "rate_limits" },
  { migration: "analytics.sql", table: "analytics_events" },
  { migration: "analytics.sql", table: "error_reports" },

  /* Tenancy. Its absence means every institute can read every other one's
     curriculum, which is the invariant the product is sold on. */
  { migration: "tenancy.sql", table: "topics", column: "org_id" },
  { migration: "tenancy.sql", table: "bank_questions", column: "org_id" },
  { migration: "tenancy.sql", table: "content_drafts", column: "org_id" },
  { migration: "tenancy.sql", table: "orgs", column: "can_author" },
  { migration: "cron.sql", table: "parent_report_log" },
  /* Added by the safety console. Its absence means compliance.sql was run
     before that console existed, and a reviewer's decision would be written
     over the excerpt it was based on. */
  { migration: "compliance.sql", table: "safety_flags", column: "review_note" },
];

/* Functions the app calls by name. A missing one is a runtime 500 on a route
   that looks fine in review. */
const FUNCTIONS: { migration: string; name: string; args: Record<string, unknown> }[] = [
  {
    migration: "tutor.sql",
    name: "start_learning_session",
    args: { p_topic_ref: "__probe__", p_concept_ref: "__probe__" },
  },
  { migration: "compliance.sql", name: "has_consent", args: { p_student: null, p_purpose: "x" } },
  {
    migration: "billing.sql",
    name: "can_access_chapter",
    args: { p_user: null, p_chapter: "__probe__" },
  },
  {
    migration: "ratelimit.sql",
    name: "take_rate_limit",
    args: { p_action: "__probe__", p_subject: "__probe__", p_limit: 0, p_window_seconds: 60 },
  },
  { migration: "analytics.sql", name: "health_snapshot", args: { p_days: 1 } },
  { migration: "analytics.sql", name: "activation_by_cohort", args: { p_weeks: 1 } },
  { migration: "tenancy.sql", name: "my_org_ids", args: {} },
  { migration: "tenancy.sql", name: "can_see_content", args: { p_org: null } },
  { migration: "compliance.sql", name: "purge_expired_data", args: {} },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const absent = missing("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
  if (absent.length > 0) reportMissing(absent);

  const db = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /* Named `gaps`, not `missing`: there is a top-level `missing()` helper that
     reports absent environment variables, and a const of the same name inside
     this function shadows it — which is a temporal-dead-zone error at the
     first call rather than anything that looks like a name clash. */
  const gaps = new Map<string, string[]>();
  const note = (migration: string, what: string) => {
    const list = gaps.get(migration) ?? [];
    list.push(what);
    gaps.set(migration, list);
  };

  console.log("Checking tables and columns…\n");

  for (const check of CHECKS) {
    const ok = await exists(db, check);
    const label = check.column ? `${check.table}.${check.column}` : check.table;

    if (ok) {
      console.log(`  ok    ${label}`);
    } else {
      console.log(`  MISS  ${label}`);
      note(check.migration, label);
    }
  }

  console.log("\nChecking functions…\n");

  for (const fn of FUNCTIONS) {
    /* Called with deliberately invalid arguments. A function that exists
       returns a value or a data error; one that does not returns a "could not
       find the function" from PostgREST, which is what is being detected. */
    const { error } = await db.rpc(fn.name, fn.args as never);
    const absent =
      error &&
      (error.message.includes("Could not find the function") ||
        error.message.includes("does not exist") ||
        error.code === "PGRST202");

    if (absent) {
      console.log(`  MISS  ${fn.name}()`);
      note(fn.migration, `${fn.name}()`);
    } else {
      console.log(`  ok    ${fn.name}()`);
    }
  }

  /* Content, because a schema with no curriculum is a working app with nothing
     to teach — and that reads as a bug to whoever opens it. */
  const { count: topics } = await db
    .from("topics")
    .select("id", { count: "exact", head: true });

  console.log(`\n${topics ?? 0} topics seeded.`);

  if (!topics) {
    console.log("  Run: npm run content:seed");
  }

  if (gaps.size === 0) {
    console.log("\nEverything the app expects is present.");
    console.log(
      "This checks presence, not policy. RLS behaviour needs a signed-in client to verify.",
    );
    return;
  }

  console.log("\nRun these, in this order:\n");

  /* Ordered by the order the files must run in, not by the order problems were
     found — running compliance.sql before schema.sql is how half of these
     appear in the first place. */
  const ORDER = [
    "schema.sql",
    "tutor.sql",
    "compliance.sql",
    "schools.sql",
    "billing.sql",
    "ratelimit.sql",
    "analytics.sql",
    "cron.sql",
  ];

  for (const migration of ORDER) {
    const items = gaps.get(migration);
    if (!items) continue;
    console.log(`  supabase/${migration}`);
    console.log(`    missing: ${items.join(", ")}`);
  }

  process.exit(1);
}

async function exists(db: SupabaseClient, check: Check): Promise<boolean> {
  const { error } = await db
    .from(check.table)
    .select(check.column ?? "*")
    .limit(0);

  return !error;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
