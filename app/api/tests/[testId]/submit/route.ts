/* Marking a test.
 *
 * ---------------------------------------------------------------------------
 * THE SERVER MARKS, AND IT MARKS FROM THE DATABASE
 *
 * The answer key is read from bank_questions here. It is never taken from the
 * request body, and no earlier response contained it. The practice endpoint
 * makes the same point about itself; the difference is what a wrong answer to
 * that question costs — a practice score is the student's own business, and a
 * test score is read by a teacher and sent to a parent.
 *
 * markAnswer() is the same function the practice loop uses, deliberately. Two
 * marking implementations disagreeing about what counts as correct is a bug
 * nobody finds until a parent asks why the same answer scored differently in
 * two places.
 *
 * ---------------------------------------------------------------------------
 * ERROR EVENTS ARE WRITTEN TOO
 *
 * Not just the score. section_heatmap and the fix sheet both read
 * error_events, so a test that recorded only marks would leave the teacher's
 * heatmap unchanged the morning after their own test — the one moment the
 * whole class answered the same questions.
 */

import { NextResponse } from "next/server";

import { fail, requireStudent } from "@/lib/ai/route";
import { markAnswer, type MarkableQuestion } from "@/lib/pedagogy/evaluate";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ testId: string }> },
) {
  const user = await requireStudent();
  if (!user.ok) return user.response;
  if (!isAdminConfigured()) return fail("Tests are not configured here.", 503);

  const { testId } = await params;

  let body: { attemptId?: string; answers?: Record<string, unknown>; timeTakenSec?: number };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  if (!body.attemptId) return fail("attemptId is required.", 400);

  const db = createAdminClient();

  /* The attempt has to be this student's, on this test, and still open. All
     three, because the id comes from a browser: somebody else's attempt id
     would otherwise let a student submit answers into another child's paper. */
  const { data: attempt } = await db
    .from("test_attempts")
    .select("id, test_id, student_id, submitted_at, started_at")
    .eq("id", body.attemptId)
    .maybeSingle();

  if (!attempt || attempt.test_id !== testId || attempt.student_id !== user.value) {
    return fail("That attempt was not found.", 404);
  }

  if (attempt.submitted_at) return fail("This attempt has already been submitted.", 409);

  const { data: paper } = await db
    .from("test_questions")
    .select(
      "question_ref, marks, sort_order, bank_questions!inner(id, topic_ref, concept_ref, qtype, stem, correct, solution, distractor_map)",
    )
    .eq("test_id", testId)
    .order("sort_order");

  if (!paper || paper.length === 0) return fail("This test has no questions.", 409);

  const answers = body.answers ?? {};

  const results = [];
  let score = 0;
  let outOf = 0;

  for (const row of paper) {
    const question = row.bank_questions as unknown as {
      id: string;
      topic_ref: string;
      concept_ref: string | null;
      qtype: MarkableQuestion["qtype"];
      stem: string;
      correct: MarkableQuestion["correct"];
      solution: string;
      distractor_map: Record<string, string>;
    };

    const markable: MarkableQuestion = {
      id: question.id,
      qtype: question.qtype,
      stem: question.stem,
      correct: question.correct,
      solution: question.solution,
      distractor_map: question.distractor_map ?? {},
      conceptId: question.concept_ref,
    };

    /* No misconception lookup passed: the text is resolved for the reply
       below, and markAnswer only needs it to phrase feedback. */
    const marked = await markAnswer(markable, answers[question.id]);

    const marks = Number(row.marks ?? 1);
    outOf += marks;
    if (marked.correct) score += marks;

    results.push({
      ref: question.id,
      order: row.sort_order as number,
      correct: marked.correct,
      marksAwarded: marked.correct ? marks : 0,
      marks,
      feedback: marked.feedback,
      solution: question.solution,
      misconceptionId: marked.misconceptionId,
      topicRef: question.topic_ref,
      etype: marked.etype,
      confidence: marked.confidence,
      source: marked.source,
      evidence: marked.evidence,
    });
  }

  await db.from("test_answers").upsert(
    results.map((result) => ({
      attempt_id: attempt.id,
      question_ref: result.ref,
      given: (answers[result.ref] ?? null) as object | null,
      is_correct: result.correct,
      marks_awarded: result.marksAwarded,
      misconception_id: result.misconceptionId,
    })),
    { onConflict: "attempt_id,question_ref" },
  );

  /* Wrong answers become error events, so the teacher's heatmap moves the
     morning after their own test. */
  const wrong = results.filter((result) => !result.correct && result.etype !== "none");

  if (wrong.length > 0) {
    await db.from("error_events").insert(
      wrong.map((result) => ({
        user_id: user.value,
        topic_ref: result.topicRef,
        etype: result.etype,
        misconception_id: result.misconceptionId,
        confidence: result.confidence,
        evidence: result.evidence,
        source: result.source,
      })),
    );
  }

  const startedAt = new Date(attempt.started_at as string).getTime();

  await db
    .from("test_attempts")
    .update({
      submitted_at: new Date().toISOString(),
      score,
      max_score: outOf,
      /* Measured from the row this endpoint wrote at start, not from a number
         the browser sends. A stopwatch a student controls is not a time. */
      time_taken_sec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
      status: "evaluated",
    })
    .eq("id", attempt.id);

  return NextResponse.json({
    score,
    outOf,
    /* Per question, and only now. This is the first response in the whole flow
       that contains a solution, and it arrives after the answers are written
       and the attempt is closed — which is what stops "start, read the
       solutions, submit" from being a strategy. */
    questions: results
      .sort((a, b) => a.order - b.order)
      .map((result) => ({
        ref: result.ref,
        correct: result.correct,
        marksAwarded: result.marksAwarded,
        marks: result.marks,
        feedback: result.feedback,
        solution: result.solution,
      })),
  });
}
