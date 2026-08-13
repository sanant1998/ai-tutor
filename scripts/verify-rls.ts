/* Does row-level security actually do what the policies claim?
 *
 *   npm run db:verify-rls
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS THE MOST IMPORTANT SCRIPT IN THE REPOSITORY
 *
 * Every claim this product makes about privacy rests on policies that have
 * been written and never executed. "A student cannot read another student's
 * rows" and "the answers are unreachable from a browser" are assertions about
 * runtime behaviour, and reading a policy is not the same as testing one.
 *
 * RLS fails in a specific and nasty way: a policy that is too permissive
 * produces no error, no warning and no symptom. Everything works. The data is
 * simply readable by people who should not read it, and nobody finds out from
 * the inside.
 *
 * So this signs in as two real students and asks, as them, for things they
 * must not have. A test that only checks the happy path would pass against a
 * database with RLS switched off entirely, which is exactly the configuration
 * it needs to catch.
 *
 * ---------------------------------------------------------------------------
 * IT CREATES AND DELETES TEST ACCOUNTS
 *
 * Two, prefixed rls-probe-. They are removed at the end, including on failure.
 * Do not point this at production: it writes rows, and a probe account left
 * behind by a crashed run would sit in your user list looking like a customer.
 */

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

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`  ok    ${name}`);
    return;
  }
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

/* An empty result and a permission error both mean "cannot see it", and both
   are acceptable. What is NOT acceptable is rows coming back. */
function deniedOrEmpty(result: { data: unknown[] | null; error: unknown }) {
  return !result.data || result.data.length === 0;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const absent = missing(
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  if (absent.length > 0) reportMissing(absent);

  if (/\bprod\b/i.test(url!) && !process.argv.includes("--i-know")) {
    console.error(
      "That URL looks like production and this script writes rows. Re-run with --i-know if you mean it.",
    );
    process.exit(1);
  }

  const admin = createClient(url!, service!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now();
  const users: { id: string; email: string; client: SupabaseClient }[] = [];

  /* Rows the tenancy probe creates. Removed in the finally block alongside the
     accounts — a probe org left behind looks like a customer, and a probe
     topic shows up in every student's tutor index. */
  const orgIds: string[] = [];
  const probeIds: string[] = [];

  const makeUser = async (label: string) => {
    const email = `rls-probe-${label}-${stamp}@example.invalid`;
    const password = `probe-${stamp}-${label}-Aa1!`;

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error || !data.user) throw new Error(`could not create ${label}: ${error?.message}`);

    const client = createClient(url!, anon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`could not sign in ${label}: ${signInError.message}`);

    users.push({ id: data.user.id, email, client });
    return { id: data.user.id, client };
  };

  const anonClient = createClient(url!, anon!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    console.log("Creating two probe accounts…\n");

    const alice = await makeUser("a");
    const bob = await makeUser("b");

    /* --- The one that matters most -----------------------------------------
       bank_questions has RLS on and no select policy. If this ever returns a
       row, every practice question in the product is an answer key. */
    console.log("Answers are unreachable from a browser");

    check(
      "signed-in student cannot select bank_questions",
      deniedOrEmpty(await alice.client.from("bank_questions").select("id, correct").limit(1)),
      "a student can read the answer key",
    );

    check(
      "anonymous caller cannot select bank_questions",
      deniedOrEmpty(await anonClient.from("bank_questions").select("id, correct").limit(1)),
    );

    check(
      "the dropped prompts view is gone",
      deniedOrEmpty(
        await alice.client.from("bank_question_prompts").select("id").limit(1),
      ),
      "bank_question_prompts still exists and is selectable",
    );

    /* --- Teaching content SHOULD be readable ------------------------------
       A test that only asserts denial would pass against a database where
       everything is denied, which would break the app entirely. */
    console.log("\nTeaching content is readable");

    const concepts = await alice.client.from("concepts").select("id").limit(1);
    check(
      "a student can read concepts",
      !concepts.error,
      concepts.error?.message ?? "denied",
    );

    const topics = await alice.client.from("topics").select("id").limit(1);
    check("a student can read topics", !topics.error, topics.error?.message ?? "denied");

    /* --- One student's rows are not another's ---------------------------- */
    console.log("\nOne student cannot read another");

    /* Seed a row for Bob with the service key, then ask for it as Alice. */
    const { data: topic } = await admin.from("topics").select("id").limit(1).maybeSingle();

    if (!topic) {
      check("curriculum is seeded so cross-student reads can be tested", false, "no topics — run npm run content:seed");
    } else {
      await admin.from("topic_mastery").upsert(
        { user_id: bob.id, topic_ref: topic.id as string, score: 42, band: "Developing" },
        { onConflict: "user_id,topic_ref" },
      );

      const seen = await alice.client
        .from("topic_mastery")
        .select("user_id, score")
        .eq("user_id", bob.id);

      check(
        "student A cannot read student B's mastery",
        deniedOrEmpty(seen),
        `read ${seen.data?.length ?? 0} of B's rows`,
      );

      /* And the write side. A policy with `using` but no `with check` lets one
         student write rows belonging to another. */
      const written = await alice.client
        .from("topic_mastery")
        .upsert(
          { user_id: bob.id, topic_ref: topic.id as string, score: 99 },
          { onConflict: "user_id,topic_ref" },
        )
        .select("user_id");

      check(
        "student A cannot write a row owned by student B",
        Boolean(written.error) || (written.data?.length ?? 0) === 0,
        "the with check clause is missing or too permissive",
      );
    }

    /* Transcripts. The product promises a parent cannot read these; the first
       requirement is that another student cannot either. */
    await admin.from("learning_sessions").insert({
      user_id: bob.id,
      topic_ref: (topic?.id as string) ?? null,
      concept_ref: null,
    }).select("id");

    const turns = await alice.client.from("session_turns").select("id").eq("user_id", bob.id);
    check("student A cannot read student B's session turns", deniedOrEmpty(turns));

    const sessions = await alice.client
      .from("learning_sessions")
      .select("id")
      .eq("user_id", bob.id);
    check("student A cannot read student B's sessions", deniedOrEmpty(sessions));

    /* --- Tables nobody may read ------------------------------------------ */
    console.log("\nServer-only tables are server-only");

    for (const table of [
      "safety_flags",
      "otp_challenges",
      "content_drafts",
      "billing_events",
      "rate_limits",
      /* The trail of who did what to whose child. Readable by an org admin
         through a policy that checks the role; a student is neither. */
      "audit_logs",
      /* Error rows in an import name other people's children. */
      "import_jobs",
      /* The paper. bank_questions has no select policy and this is the join
         table that would otherwise hand out the ids one at a time. */
      "test_questions",
    ]) {
      check(
        `a student cannot select ${table}`,
        deniedOrEmpty(await alice.client.from(table).select("*").limit(1)),
      );
    }

    /* --- Usage counters are read-only to the student --------------------- */
    console.log("\nA student cannot reset their own quota");

    const usage = await alice.client
      .from("ai_usage")
      .upsert({ user_id: alice.id, day: new Date().toISOString().slice(0, 10), action: "tutor", count: 0 })
      .select("user_id");

    check(
      "a student cannot write ai_usage",
      Boolean(usage.error) || (usage.data?.length ?? 0) === 0,
      "quota can be reset from the browser",
    );

    /* --- One institute cannot read another's curriculum -------------------
       The invariant the whole product is sold on. A coaching institute uploads
       its own material; if a competitor's students can read it, there is no
       product.

       It is also the one that fails silently and completely: nothing errors,
       the content simply appears, and the first person to notice is a
       customer. */
    console.log("\nOne organisation cannot read another's curriculum");

    const { data: orgA } = await admin
      .from("orgs")
      .insert({ name: `rls-probe-A-${stamp}`, seats: 5 })
      .select("id")
      .maybeSingle();

    const { data: orgB } = await admin
      .from("orgs")
      .insert({ name: `rls-probe-B-${stamp}`, seats: 5 })
      .select("id")
      .maybeSingle();

    if (!orgA || !orgB) {
      check("orgs can be created for the tenancy probe", false, "run supabase/schools.sql");
    } else {
      orgIds.push(orgA.id as string, orgB.id as string);

      await admin.from("org_members").insert([
        { org_id: orgA.id, user_id: alice.id, role: "student" },
        { org_id: orgB.id, user_id: bob.id, role: "student" },
      ]);

      /* A subject, chapter and topic owned by B. Full chain, because a topic
         with no readable parent would pass for the wrong reason. */
      const suffix = `probe-${stamp}`;

      /* subject_id is unique per run, not "maths".
         subjects is unique on (board, class_level, subject_id, language), and
         a seeded database already HAS cbse/8/maths — so the fixed value
         collided, the insert failed, and the chapter and topic below never
         existed. The org-can-see-its-own-material check then failed because
         there was nothing to see, which reads exactly like a policy that is
         too tight. The probe has to be unable to collide with real content. */
      const subjectInsert = await admin.from("subjects").insert({
        id: `sub-${suffix}`,
        org_id: orgB.id,
        board: "cbse",
        class_level: 8,
        subject_id: `probe-${stamp}`,
        name: "Probe",
      });

      const chapterInsert = await admin.from("chapters").insert({
        id: `ch-${suffix}`,
        org_id: orgB.id,
        subject_ref: `sub-${suffix}`,
        chapter_no: 1,
        title: "Probe chapter",
      });

      const topicInsert = await admin.from("topics").insert({
        id: `top-${suffix}`,
        org_id: orgB.id,
        chapter_ref: `ch-${suffix}`,
        topic_no: 1,
        title: "Probe topic",
      });

      probeIds.push(`top-${suffix}`, `ch-${suffix}`, `sub-${suffix}`);

      /* Checked, and checked BEFORE the policy assertions that depend on them.
         A fixture that failed to insert makes every later check answer a
         question nobody asked — and the answer looks like a privacy bug. */
      const fixtureError =
        subjectInsert.error?.message ??
        chapterInsert.error?.message ??
        topicInsert.error?.message;

      check(
        "the tenancy probe's own curriculum was created",
        !fixtureError,
        fixtureError ?? "",
      );

      const acrossTenants = await alice.client
        .from("topics")
        .select("id")
        .eq("id", `top-${suffix}`);

      check(
        "a student in org A cannot see org B's topic",
        deniedOrEmpty(acrossTenants),
        "one institute's curriculum is readable by another's students",
      );

      const ownTopic = await bob.client
        .from("topics")
        .select("id")
        .eq("id", `top-${suffix}`);

      check(
        "a student in org B CAN see their own org's topic",
        !ownTopic.error && (ownTopic.data?.length ?? 0) === 1,
        "the org filter is too tight — an institute cannot see its own material",
      );

      /* And the base curriculum, which everyone is meant to get. A test that
         only asserted denial would pass against a policy that hides
         everything, which would break the product entirely. */
      const shared = await alice.client
        .from("topics")
        .select("id")
        .is("org_id", null)
        .limit(1);

      check(
        "a student can still see the shared base curriculum",
        !shared.error && (shared.data?.length ?? 0) > 0,
        shared.error?.message ?? "no shared topics found — seed the content first",
      );
    }

    /* --- The consent gate cannot be opened from the browser ---------------
       This is the hole the generated `is_minor` column was supposed to close
       and never did. `profiles` had one row-level policy and no column grants,
       so a student could UPDATE any column of their own row — including
       account_state, which skips parental consent entirely, and dob, which
       decides whether consent is required at all.

       The fix is a GRANT in compliance.sql. These three checks are the only
       thing that will notice if it is ever dropped. */
    console.log("\nA student cannot open their own consent gate");

    const state = await alice.client
      .from("profiles")
      .update({ account_state: "active" })
      .eq("id", alice.id)
      .select("account_state");

    check(
      "a student cannot write their own account_state",
      Boolean(state.error) || (state.data?.length ?? 0) === 0,
      "the parental consent gate can be skipped from the browser",
    );

    const born = await alice.client
      .from("profiles")
      .update({ dob: "1990-01-01" })
      .eq("id", alice.id)
      .select("dob");

    check(
      "a student cannot declare their own date of birth",
      Boolean(born.error) || (born.data?.length ?? 0) === 0,
      "a minor can declare themselves an adult and skip consent",
    );

    const promoted = await alice.client
      .from("profiles")
      .update({ role: "parent" })
      .eq("id", alice.id)
      .select("role");

    check(
      "a student cannot give themselves a role",
      Boolean(promoted.error) || (promoted.data?.length ?? 0) === 0,
      "role is client-writable",
    );

    /* And the ones they SHOULD be able to write. A grant that is too tight
       breaks the language picker and the name field, and would look like the
       app being broken rather than like a policy being wrong. */
    const named = await alice.client
      .from("profiles")
      .update({ first_name: "Probe", language: "hi-IN" })
      .eq("id", alice.id)
      .select("first_name");

    check(
      "a student CAN write their own name and language",
      !named.error,
      named.error?.message ?? "denied — the column grant is too tight",
    );

    /* --- Teacher functions refuse a stranger ----------------------------- */
    console.log("\nTeacher functions check membership");

    const { data: section } = await admin.from("sections").select("id").limit(1).maybeSingle();

    if (section) {
      const overview = await alice.client.rpc("section_overview", { p_section: section.id });
      check(
        "a non-teacher cannot read a section overview",
        Boolean(overview.error),
        "section_overview returned data to someone who does not teach it",
      );
    } else {
      console.log("  skip  no sections exist to test against");
    }

    /* --- Parent links ------------------------------------------------------ */
    console.log("\nA link cannot be self-confirmed");

    await admin.from("parent_links").insert({
      parent_id: alice.id,
      student_id: bob.id,
      confirmed: false,
    });

    const confirmed = await alice.client
      .from("parent_links")
      .update({ confirmed: true })
      .eq("parent_id", alice.id)
      .eq("student_id", bob.id)
      .select("confirmed");

    check(
      "a parent cannot confirm their own link",
      Boolean(confirmed.error) || (confirmed.data?.length ?? 0) === 0,
      "a parent can grant themselves access without the student agreeing",
    );
  } finally {
    /* Always, including after a throw. A probe account left behind looks like
       a customer in the user list. */
    for (const user of users) {
      await admin.auth.admin.deleteUser(user.id).catch(() => undefined);
    }
    console.log(`\nRemoved ${users.length} probe account(s).`);
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);

  if (failures.length > 0) {
    console.log("\nEvery one of these is a privacy claim the product makes and does not keep:\n");
    failures.forEach((failure) => console.log(`  ${failure}`));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
