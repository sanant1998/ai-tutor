/* Marking one practice attempt.
 *
 * The question is looked up by id and its answer read from the database. It is
 * never taken from the request body — a marking endpoint that trusts the
 * browser for what "correct" means is a marking endpoint that awards itself
 * full marks.
 *
 * Three things are written per attempt: the attempt itself, an error_event
 * when it was wrong, and a recomputed mastery row. All three are needed and
 * they answer different questions — what happened, what kind of mistake it
 * was, and what it means for this topic. */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { consume, release } from "@/lib/ai/quota";
import { markAnswer, type MarkableQuestion } from "@/lib/pedagogy/evaluate";
import { updateTopicMastery } from "@/lib/pedagogy/mastery";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { callerIp, LIMIT_MESSAGE, takeLimit } from "@/lib/ratelimit";
import { canSee, scoped, visibleTo } from "@/lib/tenancy";
import { createClient } from "@/lib/supabase/server";
import type { Misconception } from "@/lib/content/pack";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) {
    return fail("The question bank is not configured on this deployment.", 503);
  }

  const limit = await takeLimit("practice_attempt", callerIp(request));
  if (!limit.allowed) return fail(LIMIT_MESSAGE, 429);

  let body: {
    questionId?: string;
    answer?: unknown;
    timeTakenMs?: number;
    sessionId?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const questionId = String(body.questionId ?? "").trim();
  if (!questionId) return fail("questionId is required.", 400);

  const admin = createAdminClient();

  const { data: question } = await admin
    .from("bank_questions")
    .select(
      "id, topic_ref, concept_ref, qtype, level, stem, correct, solution, distractor_map, marks, org_id",
    )
    .eq("id", questionId)
    .maybeSingle();

  if (!question) return fail("That question is not in the bank.", 404);

  /* The question id comes from the browser and RLS does not apply to the
     service-role key, so this is the only thing stopping a student at one
     institute from marking — and reading the solution to — another institute's
     question. Same 404 either way, so the endpoint cannot be used to discover
     which ids are real. */
  const visibility = await visibleTo(user.value);

  if (!canSee(question.org_id as string | null, visibility)) {
    return fail("That question is not in the bank.", 404);
  }

  /* Only subjective marking spends a model call, so only subjective marking
     spends a quota slot. Charging for a multiple-choice comparison would be
     charging for nothing. */
  const needsModel = question.qtype === "subjective";
  const supabase = await createClient();

  if (needsModel) {
    const slot = await consume(supabase, user.value, "mark");
    if (!slot.ok) return fail(slot.message, slot.status);
  }

  /* The misconception text, so feedback can name the belief rather than say
     "that's a common mistake". */
  const misconceptions = await loadMisconceptions(admin, question.concept_ref as string | null);

  const markable: MarkableQuestion = {
    id: question.id as string,
    qtype: question.qtype as MarkableQuestion["qtype"],
    stem: question.stem as string,
    correct: question.correct as MarkableQuestion["correct"],
    solution: question.solution as string,
    distractor_map: (question.distractor_map as Record<string, string>) ?? {},
    conceptId: (question.concept_ref as string | null) ?? null,
  };

  let marked;
  try {
    marked = await markAnswer(markable, body.answer, (id) =>
      misconceptions.find((entry) => entry.id === id)?.wrong_belief,
    );
  } catch (error) {
    if (needsModel) await release(supabase, "mark");
    throw error;
  }

  /* --- Record ----------------------------------------------------------- */
  const { data: attempt } = await admin
    .from("attempts")
    .insert({
      user_id: user.value,
      subject_id: "",
      chapter_id: "",
      topic_ref: question.topic_ref,
      concept_ref: question.concept_ref,
      bank_question_id: question.id,
      session_id: body.sessionId ?? null,
      level: question.level,
      correct: marked.correct,
      marks: marked.correct ? Number(question.marks ?? 1) : 0,
      max_marks: Number(question.marks ?? 1),
      error_type: marked.etype,
      answer: body.answer === undefined ? null : (body.answer as object),
      time_taken_ms: Number(body.timeTakenMs ?? 0) || null,
    })
    .select("id")
    .maybeSingle();

  if (!marked.correct && marked.etype !== "none") {
    await admin.from("error_events").insert({
      attempt_id: attempt?.id ?? null,
      user_id: user.value,
      topic_ref: question.topic_ref,
      concept_ref: question.concept_ref,
      etype: marked.etype,
      misconception_id: marked.misconceptionId,
      confidence: marked.confidence,
      evidence: marked.evidence,
      source: marked.source,
    });
  }

  const mastery = await updateTopicMastery(user.value, question.topic_ref as string);

  /* --- Reply -------------------------------------------------------------
     The solution is returned ONLY after the attempt has been recorded, and
     only for this question. That ordering is what stops "fetch the question,
     fetch the solution, then answer" from working. */
  const misconception = marked.misconceptionId
    ? misconceptions.find((entry) => entry.id === marked.misconceptionId)
    : null;

  return NextResponse.json({
    correct: marked.correct,
    feedback: marked.feedback,
    solution: question.solution as string,
    error: marked.correct
      ? null
      : {
          type: marked.etype,
          source: marked.source,
          confidence: marked.confidence,
          misconception: misconception
            ? {
                id: misconception.id,
                belief: misconception.wrong_belief,
                whyWrong: misconception.why_wrong,
                correction: misconception.correction,
              }
            : null,
        },
    mastery: mastery
      ? { score: mastery.score, band: mastery.band, nextReview: mastery.next_review_at }
      : null,
  });
}

async function loadMisconceptions(
  admin: ReturnType<typeof createAdminClient>,
  conceptId: string | null,
): Promise<Misconception[]> {
  if (!conceptId) return [];

  const { data } = await admin
    .from("concepts")
    .select("misconceptions")
    .eq("id", conceptId)
    .maybeSingle();

  return ((data?.misconceptions as Misconception[] | null) ?? []) as Misconception[];
}
