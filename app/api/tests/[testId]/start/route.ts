/* Opening a test.
 *
 * ---------------------------------------------------------------------------
 * WHAT COMES BACK, AND WHAT CANNOT
 *
 * The paper: stem, options, marks, order. Not `correct`, not `solution`, not
 * `distractor_map` — the same rule the practice endpoint states at the top of
 * itself, and it matters more here, because a practice answer in the network
 * tab costs the student their own practice, while a test answer in the network
 * tab costs the teacher their assessment.
 *
 * Two things enforce it: bank_questions has no RLS select policy, so the
 * browser's own client gets nothing however it asks, and the select below
 * names its columns rather than using *, so a column added later cannot
 * quietly start being served.
 *
 * ---------------------------------------------------------------------------
 * THE ATTEMPT IS CREATED HERE, NOT AT SUBMIT
 *
 * So that a student who opens the paper, reads it and closes the tab has an
 * attempt on record with no submission. That is what `attempts_allowed` has to
 * count against — otherwise the paper can be opened, read, closed and opened
 * again with the questions already known.
 */

import { NextResponse } from "next/server";

import { fail, requireStudent } from "@/lib/ai/route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ testId: string }> },
) {
  const user = await requireStudent();
  if (!user.ok) return user.response;
  if (!isAdminConfigured()) return fail("Tests are not configured here.", 503);

  const { testId } = await params;

  /* The student's own client. The policy on tests decides whether this test
     exists for them at all — published, and set for a section they are in —
     so a test id from another class is a 404 rather than a 403 that confirms
     it is real. */
  const supabase = await createClient();

  const { data: test } = await supabase
    .from("tests")
    .select("id, title, kind, duration_minutes, attempts_allowed, opens_at, closes_at, status")
    .eq("id", testId)
    .maybeSingle();

  if (!test || test.status !== "published") return fail("That test was not found.", 404);

  const now = Date.now();

  if (test.opens_at && new Date(test.opens_at as string).getTime() > now) {
    return fail(`Ye test ${new Date(test.opens_at as string).toLocaleString("en-IN")} se khulega.`, 409);
  }

  if (test.closes_at && new Date(test.closes_at as string).getTime() < now) {
    return fail("The window for this test has closed.", 409);
  }

  const db = createAdminClient();

  /* Attempts already taken, including the ones that were opened and abandoned
     — see the note at the top about why those count. */
  const { data: existing } = await db
    .from("test_attempts")
    .select("id, attempt_no, submitted_at")
    .eq("test_id", testId)
    .eq("student_id", user.value)
    .order("attempt_no", { ascending: false });

  const live = (existing ?? []).find((attempt) => !attempt.submitted_at);

  const allowed = Number(test.attempts_allowed ?? 1);

  if (!live && (existing?.length ?? 0) >= allowed) {
    return fail(
      allowed === 1
        ? "You have already sat this test once."
        : `You have used all ${allowed} attempts on this test.`,
      409,
    );
  }

  /* An unsubmitted attempt is resumed rather than replaced. A student whose
     phone died mid-test has not used up a second attempt. */
  const attemptId =
    live?.id ??
    (
      await db
        .from("test_attempts")
        .insert({
          test_id: testId,
          student_id: user.value,
          attempt_no: (existing?.[0]?.attempt_no ?? 0) + 1,
          status: "in_progress",
        })
        .select("id")
        .maybeSingle()
    ).data?.id;

  if (!attemptId) return fail("The attempt could not be started.", 500);

  const { data: paper } = await db
    .from("test_questions")
    .select("question_ref, sort_order, marks, bank_questions!inner(stem, options, qtype)")
    .eq("test_id", testId)
    .order("sort_order");

  return NextResponse.json({
    attemptId,
    title: test.title,
    durationMinutes: test.duration_minutes,
    resumed: Boolean(live),
    questions: (paper ?? []).map((row) => {
      const question = row.bank_questions as unknown as {
        stem: string;
        options: unknown;
        qtype: string;
      };

      return {
        ref: row.question_ref as string,
        order: row.sort_order as number,
        marks: row.marks as number,
        qtype: question.qtype,
        stem: question.stem,
        options: question.options ?? null,
      };
    }),
  });
}
