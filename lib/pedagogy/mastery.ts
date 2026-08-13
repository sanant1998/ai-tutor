/* Topic mastery, and when to bring a topic back.

   lib/mastery.ts scores a CHAPTER for exam readiness from recent attempts.
   This scores a TOPIC for the tutor, which is a different question with a
   different shape: readiness asks "if the exam were tomorrow", mastery asks
   "has this been learned, and when should it be seen again".

   The score is deliberately simple:

     30%  taught      the concept was explained and the session closed
     45%  practice    accuracy, weighted so the hard levels count for more
     25%  test        the chapter test, when one has been sat

   Three inputs rather than one, because each catches a different lie. Practice
   accuracy alone rewards a student who only ever answers L1 questions.
   Teaching alone rewards sitting through an explanation. A test alone is one
   bad morning. Together they are hard to fake without learning something.

   ---------------------------------------------------------------------------
   WHY SM-2 AND NOT SOMETHING CLEVERER

   The scheduling algorithm is SM-2, which is forty years old and was designed
   for flashcards. Better algorithms exist. They need far more data per item
   than a topic seen four times can provide, and their advantage shows up over
   thousands of reviews — which is not the shape of one chapter of Class 8
   maths. SM-2 needs three numbers and is right about the thing that matters:
   review a weak topic in a day and a strong one in a fortnight. */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { LevelId } from "@/lib/mastery";

export type Band = "Not started" | "Foundation" | "Developing" | "Proficient" | "Advanced";

/* L3 and L4 carry more because they are where the difference between "can
   follow a method" and "knows what this is" shows up. */
const LEVEL_WEIGHT: Record<LevelId, number> = { L1: 1, L2: 1, L3: 1.5, L4: 1.5 };

export function bandFor(score: number): Band {
  if (score >= 85) return "Advanced";
  if (score >= 65) return "Proficient";
  if (score >= 40) return "Developing";
  if (score > 0) return "Foundation";
  return "Not started";
}

export type MasteryRow = {
  teach_done: boolean;
  practice_acc: number;
  test_score: number | null;
  score: number;
  band: Band;
  ease_factor: number;
  interval_days: number;
  next_review_at: string | null;
};

export async function updateTopicMastery(
  userId: string,
  topicRef: string,
  patch: { teachDone?: boolean; testScore?: number } = {},
): Promise<MasteryRow | null> {
  const admin = createAdminClient();

  const [{ data: existing }, { data: attempts }] = await Promise.all([
    admin
      .from("topic_mastery")
      .select("*")
      .eq("user_id", userId)
      .eq("topic_ref", topicRef)
      .maybeSingle(),
    /* Last 40 attempts on this topic. Beyond that the student is a different
       student — and a bad first week should not hold a score down in month
       two. */
    admin
      .from("attempts")
      .select("level, correct")
      .eq("user_id", userId)
      .eq("topic_ref", topicRef)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  let earned = 0;
  let possible = 0;

  for (const attempt of attempts ?? []) {
    const weight = LEVEL_WEIGHT[(attempt.level as LevelId) ?? "L2"] ?? 1;
    possible += weight;
    if (attempt.correct) earned += weight;
  }

  const practice = possible > 0 ? (earned / possible) * 100 : 0;

  const teachDone = patch.teachDone ?? Boolean(existing?.teach_done);
  const testScore =
    patch.testScore ?? (existing?.test_score !== null && existing?.test_score !== undefined
      ? Number(existing.test_score)
      : null);

  const score =
    0.3 * (teachDone ? 100 : 0) + 0.45 * practice + 0.25 * (testScore ?? 0);

  const schedule = scheduleNext({
    practiceAccuracy: practice,
    easeFactor: Number(existing?.ease_factor ?? 2.5),
    intervalDays: Number(existing?.interval_days ?? 0),
    /* No practice at all yet: teaching is done but nothing is evidenced, so
       bring it back tomorrow rather than in a fortnight. */
    unpractised: possible === 0,
  });

  const row = {
    user_id: userId,
    topic_ref: topicRef,
    teach_done: teachDone,
    practice_acc: Number(practice.toFixed(2)),
    test_score: testScore,
    score: Number(score.toFixed(2)),
    band: bandFor(score),
    ease_factor: schedule.easeFactor,
    interval_days: schedule.intervalDays,
    next_review_at: schedule.nextReview,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("topic_mastery")
    .upsert(row, { onConflict: "user_id,topic_ref" });

  if (error) return null;

  return {
    teach_done: row.teach_done,
    practice_acc: row.practice_acc,
    test_score: row.test_score,
    score: row.score,
    band: row.band,
    ease_factor: row.ease_factor,
    interval_days: row.interval_days,
    next_review_at: row.next_review_at,
  };
}

/* --------------------------------------------------------------------------
   SM-2
   -------------------------------------------------------------------------- */
export function scheduleNext(input: {
  practiceAccuracy: number;
  easeFactor: number;
  intervalDays: number;
  unpractised?: boolean;
}) {
  if (input.unpractised) {
    return {
      easeFactor: input.easeFactor,
      intervalDays: 1,
      nextReview: addDays(1),
    };
  }

  /* SM-2's recall quality, 0-5, from accuracy. */
  const quality = Math.max(0, Math.min(5, Math.round(input.practiceAccuracy / 20)));

  const easeFactor = Math.max(
    1.3,
    Number(
      (
        input.easeFactor +
        (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
      ).toFixed(2),
    ),
  );

  /* Below 60% the topic is not learned. SM-2 restarts the interval rather than
     stretching it, which is the whole point: a wrong answer today means
     tomorrow, not next week. */
  if (quality < 3) {
    return { easeFactor, intervalDays: 1, nextReview: addDays(1) };
  }

  const intervalDays =
    input.intervalDays === 0 ? 1 : input.intervalDays === 1 ? 6 : Math.round(input.intervalDays * easeFactor);

  /* A cap, because a schedule that says "next review in 14 months" inside a
     one-year course is arithmetic, not teaching. */
  const capped = Math.min(intervalDays, 120);

  return { easeFactor, intervalDays: capped, nextReview: addDays(capped) };
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/* Topics due today or overdue, soonest first — what the dashboard's "revise
   these" list is built from. */
export async function dueTopics(userId: string, limit = 10) {
  const { data } = await createAdminClient()
    .from("topic_mastery")
    .select("topic_ref, score, band, next_review_at, topics(title)")
    .eq("user_id", userId)
    .lte("next_review_at", new Date().toISOString().slice(0, 10))
    .order("next_review_at")
    .limit(limit);

  return (data ?? []).map((row) => {
    const topic = row.topics as unknown as { title?: string } | { title?: string }[] | null;

    return {
      topicId: row.topic_ref as string,
      title: (Array.isArray(topic) ? topic[0]?.title : topic?.title) ?? "",
      score: Number(row.score ?? 0),
      band: row.band as Band,
      due: row.next_review_at as string,
    };
  });
}
