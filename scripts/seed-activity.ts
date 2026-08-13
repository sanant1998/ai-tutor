/* Three weeks of learning history for a seeded student.
 *
 *   node --import ./scripts/register-alias.mjs scripts/seed-activity.ts
 *   ... --email student@paperpath.test    a different account
 *   ... --remove                          delete it again
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * scripts/seed-accounts.ts creates a student who has never done anything, and
 * most of this product is a view over what a student has done. Signed in as
 * that account, Progress is empty, the Roadmap has nothing due, the Fix Sheet
 * has no mistakes to fix and the teacher's heatmap is a grid of blanks. Every
 * one of those screens then looks broken rather than new, and the only way to
 * tell the difference is to spend an hour answering questions by hand.
 *
 * ---------------------------------------------------------------------------
 * IT DOES NOT WRITE THE NUMBERS IT IS TESTING
 *
 * The temptation is to insert topic_mastery rows with plausible scores. That
 * produces a database no real user could ever arrive at, and it tests nothing:
 * the scoring formula, the SM-2 schedule and the band thresholds are exactly
 * the parts worth exercising, and hand-written rows skip all three.
 *
 * So this writes only the things a student actually does — attempts, the
 * errors diagnosed from them, and closed teaching sessions — and then calls
 * the application's own updateTopicMastery to derive the rest. Every score,
 * band, ease factor and review date below is computed by the code that runs in
 * production. If that code is wrong, this data is wrong in the same way, which
 * is the point.
 *
 * ---------------------------------------------------------------------------
 * THE SHAPE OF THE HISTORY
 *
 * A student who is good at some things and not others, because a uniformly
 * strong or uniformly weak account exercises none of the branches. Chapter 1
 * is largely learned; the two topics that carry the chapter's real difficulty
 * are shaky; chapter 2 has barely been started. That gives at least one topic
 * in every band, at least one due for review today, and enough diagnosed
 * errors for the Fix Sheet to have something to say.
 *
 * The wrong answers are not random either. Each one picks a real distractor
 * from the question's own distractor_map, so the misconception recorded
 * against it is one the content author actually wrote — which is what the Fix
 * Sheet prints back and what the tutor targets on a reteach. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(resolve(ROOT, file), "utf8").split(/\r?\n/)) {
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
        }
      }
    } catch {
      /* Not there; the shell may have them. */
    }
  }
}

loadEnv();

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const EMAIL = arg("email", "student@paperpath.test");

/* How well the student did, per topic.
 *
 * `accuracy` is the share of attempts they got right; the seeder picks which
 * ones to fail rather than rolling dice, so a re-run produces the same history
 * and a screenshot taken today still matches the database next week.
 *
 * `taught` is whether the teaching session was closed. A topic can be
 * practised without being taught — that is a student who jumped straight to
 * questions — and the score formula weights the two separately, so both
 * shapes are worth having in the data. */
const PLAN: { topic: string; attempts: number; accuracy: number; taught: boolean }[] = [
  { topic: "c8-math-ch1-t1", attempts: 12, accuracy: 0.92, taught: true },
  { topic: "c8-math-ch1-t2", attempts: 10, accuracy: 0.8, taught: true },
  /* The two that carry chapter 1's real difficulty. Low enough to land in the
     lower bands and to force SM-2 to bring them back tomorrow. */
  { topic: "c8-math-ch1-t3", attempts: 9, accuracy: 0.44, taught: true },
  { topic: "c8-math-ch1-t4", attempts: 8, accuracy: 0.38, taught: true },
  { topic: "c8-math-ch1-t5", attempts: 6, accuracy: 0.67, taught: true },
  /* Chapter 2 has been opened and not finished: taught, barely practised. */
  { topic: "c8-math-ch2-t1", attempts: 4, accuracy: 0.5, taught: true },
  /* Practised without being taught — the student who skips ahead. */
  { topic: "c8-math-ch2-t2", attempts: 3, accuracy: 0.33, taught: false },
];

/* Which error the diagnosis recorded. Weighted towards the two that a Class 8
   student actually makes most, so the Fix Sheet's ranking is not a flat list. */
const ERROR_TYPES = [
  "concept", "concept", "concept",
  "calculation", "calculation",
  "application",
  "careless",
  "formula",
];

const DAY = 86_400_000;

/* Spread across the last three weeks, oldest first, skipping nothing —
   including two rest days, so the streak is not a suspiciously perfect run. */
function dayFor(index: number, total: number): Date {
  const spread = 20;
  const offset = Math.round((index / Math.max(1, total - 1)) * spread);
  return new Date(Date.now() - (spread - offset) * DAY);
}

async function main() {
  console.log(`Project: ${URL_}\n`);

  const { data: profile } = await db
    .from("profiles")
    .select("id, role")
    .ilike("email", EMAIL)
    .maybeSingle();

  if (!profile) {
    console.error(`No account for ${EMAIL}. Run scripts/seed-accounts.ts first.`);
    process.exit(1);
  }

  const userId = profile.id as string;

  if (process.argv.includes("--remove")) {
    await remove(userId);
    return;
  }

  /* Idempotent: this account's history is replaced, not added to. Running it
     twice should not produce a student with six weeks of work. */
  await remove(userId, true);

  const { data: questions } = await db
    .from("bank_questions")
    .select("id, topic_ref, concept_ref, level, marks, options, correct, distractor_map")
    .in("topic_ref", PLAN.map((p) => p.topic));

  if (!questions?.length) {
    console.error("No questions in the bank. Run: npm run content:seed");
    process.exit(1);
  }

  const byTopic = new Map<string, typeof questions>();
  for (const q of questions) {
    const list = byTopic.get(q.topic_ref as string) ?? [];
    list.push(q);
    byTopic.set(q.topic_ref as string, list);
  }

  let attemptCount = 0;
  let errorCount = 0;
  let sessionCount = 0;

  for (const plan of PLAN) {
    const pool = byTopic.get(plan.topic) ?? [];
    if (!pool.length) {
      console.log(`  skipped ${plan.topic} — no questions seeded`);
      continue;
    }

    /* --- The teaching session ------------------------------------------- */
    if (plan.taught) {
      const firstConcept = pool[0].concept_ref as string;
      const startedAt = dayFor(0, plan.attempts);

      const { data: session } = await db
        .from("learning_sessions")
        .insert({
          user_id: userId,
          topic_ref: plan.topic,
          concept_ref: firstConcept,
          current_beat: "DONE",
          turns_used: 8,
          reteach_count: plan.accuracy < 0.6 ? 2 : 0,
          status: "completed",
          started_at: startedAt.toISOString(),
        })
        .select("id")
        .maybeSingle();

      if (session) {
        sessionCount += 1;

        /* A short transcript. Enough that the session opens and reads as a
           lesson rather than an empty shell; not a fabricated full lesson,
           because nobody should mistake this for real teaching. */
        await db.from("session_turns").insert(
          [
            ["student", "HOOK", "shuru karo"],
            ["tutor", "HOOK", "Chalo is topic se shuru karte hain."],
            ["student", "TEACH", "samajh gaya"],
            ["tutor", "CHECK", "Ek chhota sawal — apne shabdon me batao."],
          ].map(([role, beat, content], i) => ({
            session_id: session.id,
            user_id: userId,
            seq: i + 1,
            beat,
            role,
            content,
            created_at: new Date(startedAt.getTime() + i * 60_000).toISOString(),
          })),
        );
      }
    }

    /* --- The attempts ---------------------------------------------------- */
    const correctCount = Math.round(plan.attempts * plan.accuracy);

    for (let i = 0; i < plan.attempts; i += 1) {
      const question = pool[i % pool.length];
      /* Deterministic, and the failures are spread through the run rather than
         bunched at the end — a student who got the last four wrong is a
         different story from one who was inconsistent throughout. */
      const correct = i % plan.attempts < correctCount;
      const at = dayFor(i, plan.attempts);

      const errorType = correct ? "none" : ERROR_TYPES[(i * 3) % ERROR_TYPES.length];

      const { data: attempt } = await db
        .from("attempts")
        .insert({
          user_id: userId,
          board_id: "cbse",
          class_level: 8,
          subject_id: "maths",
          chapter_id: plan.topic.split("-t")[0],
          topic_ref: plan.topic,
          concept_ref: question.concept_ref,
          bank_question_id: question.id,
          level: question.level,
          correct,
          marks: correct ? (question.marks as number) : 0,
          max_marks: question.marks as number,
          error_type: errorType,
          time_taken_ms: 40_000 + ((i * 7919) % 80_000),
          created_at: at.toISOString(),
        })
        .select("id")
        .maybeSingle();

      attemptCount += 1;

      if (correct || !attempt) continue;

      /* The misconception comes from the question's own distractor map, so it
         is one the author wrote for exactly this wrong answer. A made-up id
         would print a correction on the Fix Sheet for a belief nobody has. */
      const map = (question.distractor_map ?? {}) as Record<string, string>;
      const keys = Object.keys(map);
      const chosen = keys.length ? map[keys[i % keys.length]] : null;

      await db.from("error_events").insert({
        attempt_id: attempt.id,
        user_id: userId,
        topic_ref: plan.topic,
        concept_ref: question.concept_ref,
        etype: errorType,
        misconception_id: chosen,
        confidence: 0.9,
        evidence: "seeded by scripts/seed-activity.ts",
        /* Truthful about where the diagnosis came from. Claiming 'llm' would
           put fabricated rows in the same bucket as real model output and make
           the health dashboard's "how much diagnosis comes from a model"
           number a lie. */
        source: "distractor_map",
        created_at: at.toISOString(),
      });

      errorCount += 1;
    }

    /* --- Let the application score it ------------------------------------ */
    const { updateTopicMastery } = await import("../lib/pedagogy/mastery.ts");
    await updateTopicMastery(userId, plan.topic, { teachDone: plan.taught });

    console.log(`  ${plan.topic.padEnd(20)} ${plan.attempts} attempts, ${Math.round(plan.accuracy * 100)}% accuracy${plan.taught ? ", taught" : ""}`);
  }

  /* --- What the scoring actually produced ------------------------------- */
  const { data: mastery } = await db
    .from("topic_mastery")
    .select("topic_ref, score, band, practice_acc, interval_days, next_review_at")
    .eq("user_id", userId)
    .order("topic_ref");

  console.log(`\n  ${attemptCount} attempts · ${errorCount} diagnosed errors · ${sessionCount} sessions\n`);
  console.log("  topic".padEnd(24) + "score".padEnd(8) + "band".padEnd(13) + "practice".padEnd(10) + "review");
  console.log("  " + "-".repeat(66));
  for (const row of mastery ?? []) {
    console.log(
      "  " + String(row.topic_ref).padEnd(22) +
      String(row.score).padEnd(8) +
      String(row.band).padEnd(13) +
      `${row.practice_acc}%`.padEnd(10) +
      String(row.next_review_at ?? "—"),
    );
  }

  console.log("\n  Every number above was computed by lib/pedagogy/mastery.ts, not written here.");
  console.log(`  Undo:  node --import ./scripts/register-alias.mjs scripts/seed-activity.ts --remove`);
}

async function remove(userId: string, quiet = false) {
  /* error_events cascade from attempts and session_turns from sessions, but
     they are deleted explicitly: an error_event whose attempt_id is null is
     legitimate, so relying on the cascade would leave those behind. */
  for (const table of ["error_events", "attempts", "session_turns", "learning_sessions", "topic_mastery"]) {
    const { error } = await db.from(table).delete().eq("user_id", userId);
    if (error && !quiet) console.log(`  could not clear ${table}: ${error.message}`);
  }

  if (!quiet) console.log("  history removed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
