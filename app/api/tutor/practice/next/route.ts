/* The next practice question.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS ENDPOINT MUST NEVER RETURN
 *
 * correct, solution, distractor_map. Not once, not in a debug field, not
 * "temporarily". A student with the browser console open is not a threat model
 * to argue about — it is the median fourteen-year-old, and an answer in the
 * network tab makes the practice layer worthless within a week of anyone
 * noticing.
 *
 * Two things enforce that. bank_questions has no RLS select policy, so the
 * browser's own Supabase client gets nothing however it asks. And the select
 * below names its columns rather than using *, so a column added to the table
 * later cannot silently start being served. */

import { NextResponse } from "next/server";

import { chapterAccess, chapterOfTopic, PAYWALL_MESSAGE } from "@/lib/billing/access";
import { scoped, visibleTo } from "@/lib/tenancy";
import { fail, requireStudent } from "@/lib/ai/route";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";


export const runtime = "nodejs";

const LEVELS = ["L1", "L2", "L3", "L4"] as const;

export async function GET(request: Request) {
  const user = await requireStudent();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) {
    return fail("The question bank is not configured on this deployment.", 503);
  }

  const url = new URL(request.url);
  const topicId = url.searchParams.get("topicId");
  const conceptId = url.searchParams.get("conceptId");
  const requested = url.searchParams.get("level");

  if (!topicId) return fail("topicId is required.", 400);

  /* Same gate as the tutor. Practice on a paid chapter without the teaching
     would be a way round the paywall, and a cheaper one than it looks — the
     question bank is most of the value. */
  const chapterRef = await chapterOfTopic(topicId);

  if (chapterRef) {
    const access = await chapterAccess(user.value, chapterRef);
    if (!access.allowed) {
      return NextResponse.json(
        { error: PAYWALL_MESSAGE, paywall: true, chapterId: chapterRef },
        { status: 402 },
      );
    }
  }

  const admin = createAdminClient();

  /* Row-level security does not apply to this client, so the org filter lives
     here instead. Without it a student could name any topic id and be served
     another institute's question. */
  const visibility = await visibleTo(user.value);

  /* Which level to serve. Given explicitly it is honoured; otherwise it climbs
     with the student — two right in a row moves up, a wrong answer moves down.
     A ladder, not a flat pile: the jump that loses students is not difficulty,
     it is being asked to identify the method rather than apply it. */
  const level =
    requested && (LEVELS as readonly string[]).includes(requested)
      ? requested
      : await suggestLevel(admin, user.value, topicId);

  const { data: seen } = await admin
    .from("attempts")
    .select("bank_question_id")
    .eq("user_id", user.value)
    .eq("topic_ref", topicId)
    .not("bank_question_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);

  const seenIds = (seen ?? []).map((row) => row.bank_question_id as string);

  let query = scoped(
    admin
      .from("bank_questions")
      .select("id, qtype, level, stem, options, marks, concept_ref, org_id")
      .eq("topic_ref", topicId)
      .eq("level", level),
    visibility,
  );

  if (conceptId) query = query.eq("concept_ref", conceptId);
  if (seenIds.length > 0) query = query.not("id", "in", `(${seenIds.map((id) => `"${id}"`).join(",")})`);

  const { data: fresh } = await query.limit(10);

  /* Everything at this level has been seen. Serving a repeat is better than
     serving nothing — spaced repetition wants repeats — but say so, because a
     student who recognises a question and is not told will assume the app is
     broken. */
  let question = pick(fresh ?? []);
  let repeat = false;

  if (!question) {
    /* The same query without the "not already seen" filter — and, crucially,
       WITH the concept filter still applied. Dropping it here (the fallback
       used to rebuild the query from scratch and forget it) meant a student
       working on one concept could be handed a repeat from a different one,
       which reads as the app losing its place rather than as revision. */
    let repeats = scoped(
      admin
        .from("bank_questions")
        .select("id, qtype, level, stem, options, marks, concept_ref, org_id")
        .eq("topic_ref", topicId)
        .eq("level", level),
      visibility,
    );

    if (conceptId) repeats = repeats.eq("concept_ref", conceptId);

    const { data: seenBefore } = await repeats.limit(10);

    question = pick(seenBefore ?? []);
    repeat = Boolean(question);
  }

  if (!question) {
    return fail(`No ${level} questions have been seeded for this topic yet.`, 404);
  }

  return NextResponse.json({
    question: {
      id: question.id as string,
      qtype: question.qtype as string,
      level: question.level as string,
      stem: question.stem as string,
      options: (question.options as { key: string; text: string }[] | null) ?? null,
      marks: Number(question.marks ?? 1),
      conceptId: (question.concept_ref as string | null) ?? null,
    },
    repeat,
  });
}

function pick<T>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return rows[Math.floor(Math.random() * rows.length)];
}

async function suggestLevel(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  topicId: string,
): Promise<string> {
  const { data } = await admin
    .from("attempts")
    .select("level, correct")
    .eq("user_id", userId)
    .eq("topic_ref", topicId)
    .order("created_at", { ascending: false })
    .limit(3);

  const recent = data ?? [];
  if (recent.length === 0) return "L1";

  const index = LEVELS.indexOf(
    (recent[0].level as (typeof LEVELS)[number]) ?? "L1",
  );

  /* One wrong answer drops a level immediately. Two right in a row climb.
     Asymmetric on purpose — struggling should be answered faster than
     succeeding is rewarded. */
  if (!recent[0].correct) return LEVELS[Math.max(0, index - 1)];

  const climbing = recent.length >= 2 && recent[0].correct && recent[1].correct;
  return LEVELS[climbing ? Math.min(LEVELS.length - 1, index + 1) : index];
}
