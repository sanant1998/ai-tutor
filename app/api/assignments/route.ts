/* Homework, both directions.
 *
 * ---------------------------------------------------------------------------
 * GET IS THE STUDENT'S LIST, POST IS THE STUDENT SUBMITTING
 *
 * Both through the caller's own client, which is unusual in this codebase —
 * most writes go through the service-role key because most tables have no
 * insert policy. This one does, deliberately: submitting homework is the
 * student's own act on their own row, assessment.sql writes the rule as a
 * policy, and a column grant stops the same PATCH from setting marks.
 *
 * So the rule lives in the database and this route does not restate it. If the
 * policy is wrong, this endpoint is wrong, and there is one place to fix.
 *
 * Grading is a different endpoint, because it is a different person.
 */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (!user.ok) return user.response;

  const supabase = await createClient();

  /* The policy shows a student the assignments for sections they are in, and
     a teacher the ones for sections they teach. Same query, different rows —
     which is what a policy is for. */
  const { data: assignments, error } = await supabase
    .from("assignments")
    .select("id, section_id, chapter_ref, topic_ref, due_on, note, max_marks, created_at")
    .order("due_on", { ascending: true, nullsFirst: false })
    .limit(50);

  if (error) return NextResponse.json({ assignments: [] });

  const { data: mine } = await supabase
    .from("assignment_submissions")
    .select("assignment_id, content, submitted_at, marks_obtained, feedback, graded_at, status")
    .eq("student_id", user.value);

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title")
    .in(
      "id",
      (assignments ?? []).map((row) => row.chapter_ref).filter(Boolean) as string[],
    );

  const titleOf = new Map((chapters ?? []).map((row) => [row.id as string, row.title as string]));

  return NextResponse.json({
    assignments: (assignments ?? []).map((assignment) => {
      const submission = (mine ?? []).find((row) => row.assignment_id === assignment.id);

      return {
        id: assignment.id as string,
        note: assignment.note as string | null,
        chapter: assignment.chapter_ref ? (titleOf.get(assignment.chapter_ref as string) ?? null) : null,
        dueOn: assignment.due_on as string | null,
        maxMarks: assignment.max_marks as number | null,
        /* Overdue is computed here rather than shown as a raw date, because
           "due 12 Nov" and "two days late" are different sentences to a
           fourteen-year-old and only one of them prompts anything. */
        overdue:
          Boolean(assignment.due_on) &&
          !submission?.submitted_at &&
          new Date(assignment.due_on as string) < new Date(),
        submission: submission
          ? {
              content: submission.content as string | null,
              submittedAt: submission.submitted_at as string | null,
              marks: submission.marks_obtained as number | null,
              feedback: submission.feedback as string | null,
              gradedAt: submission.graded_at as string | null,
              status: submission.status as string,
            }
          : null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  let body: { assignmentId?: string; content?: string };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  if (!body.assignmentId || !body.content?.trim()) {
    return fail("Kuch likhe bina jama nahi kar sakte.", 400);
  }

  const supabase = await createClient();

  /* Upsert, because a student editing before the deadline is the normal case
     and the policy already limits it to rows that are not yet marked. The
     column grant is what stops this same call from setting marks_obtained —
     the policy limits WHICH ROWS, the grant limits WHICH COLUMNS, and both
     are needed. */
  const { error } = await supabase.from("assignment_submissions").upsert(
    {
      assignment_id: body.assignmentId,
      student_id: user.value,
      content: body.content.trim(),
      submitted_at: new Date().toISOString(),
      status: "submitted",
    },
    { onConflict: "assignment_id,student_id" },
  );

  if (error) {
    /* The policy refuses two things with the same shape: a student who is not
       in that section, and work that has already been marked. Both are
       correct refusals and neither should hint at the other. */
    return fail(
      "Jama nahi ho paaya. Ho sakta hai ye assignment aapki class ka na ho, ya check ho chuka ho.",
      403,
    );
  }

  return NextResponse.json({ submitted: true });
}
