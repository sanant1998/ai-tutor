/* Collecting homework, and marking it.
 *
 * ---------------------------------------------------------------------------
 * THE INBOX IS A POLICY READ, THE MARK IS A SERVICE-ROLE WRITE
 *
 * Reading submissions goes through the teacher's own client: assessment.sql
 * says whoever teaches the section may read them, and teaches_section()
 * re-checks the assignment at the moment of asking. Nothing is restated here.
 *
 * Writing the mark cannot go the same way. `authenticated` has UPDATE on three
 * columns of assignment_submissions and marks_obtained is deliberately not one
 * of them — that grant is what stops a student awarding themselves full marks,
 * and it applies to teachers too, because column grants are per role and not
 * per person. So grading runs with the service-role key, after this route has
 * checked the caller teaches the section.
 */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  const sectionId = new URL(request.url).searchParams.get("sectionId");
  if (!sectionId) return fail("sectionId is required.", 400);

  const supabase = await createClient();

  const { data: teaches } = await supabase.rpc("teaches_section", { p_section: sectionId });
  if (teaches !== true) return fail("Ye section aapka nahi hai.", 403);

  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, note, due_on, max_marks, chapter_ref")
    .eq("section_id", sectionId)
    .order("due_on", { ascending: false, nullsFirst: false })
    .limit(20);

  const { data: submissions } = await supabase
    .from("assignment_submissions")
    .select("id, assignment_id, student_id, content, submitted_at, marks_obtained, status")
    .in(
      "assignment_id",
      (assignments ?? []).map((row) => row.id as string),
    );

  const { data: names } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .in(
      "id",
      [...new Set((submissions ?? []).map((row) => row.student_id as string))],
    );

  const nameOf = new Map(
    (names ?? []).map((row) => [
      row.id as string,
      `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Student",
    ]),
  );

  return NextResponse.json({
    assignments: (assignments ?? []).map((assignment) => {
      const mine = (submissions ?? []).filter((row) => row.assignment_id === assignment.id);

      return {
        id: assignment.id as string,
        note: assignment.note as string | null,
        dueOn: assignment.due_on as string | null,
        maxMarks: assignment.max_marks as number | null,
        /* Two counts, not one. "18 submitted" alone does not say whether the
           teacher has anything to do; "18 submitted, 6 marked" does. */
        submitted: mine.filter((row) => row.submitted_at).length,
        marked: mine.filter((row) => row.status === "graded").length,
        submissions: mine
          .filter((row) => row.submitted_at)
          .map((row) => ({
            id: row.id as string,
            studentId: row.student_id as string,
            name: nameOf.get(row.student_id as string) ?? "Student",
            content: row.content as string | null,
            submittedAt: row.submitted_at as string,
            marks: row.marks_obtained as number | null,
            status: row.status as string,
          })),
      };
    }),
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;
  if (!isAdminConfigured()) return fail("Not configured.", 503);

  let body: { submissionId?: string; marks?: number; feedback?: string };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  if (!body.submissionId) return fail("submissionId is required.", 400);

  const supabase = await createClient();
  const db = createAdminClient();

  /* The submission is resolved with the ADMIN client and authorised
     separately, because the teacher's own client can already read it — and
     using that read as the authorisation would mean the check and the write
     look at two different things. */
  const { data: submission } = await db
    .from("assignment_submissions")
    .select("id, assignment_id, student_id, marks_obtained")
    .eq("id", body.submissionId)
    .maybeSingle();

  if (!submission) return fail("Ye submission nahi mila.", 404);

  const { data: assignment } = await db
    .from("assignments")
    .select("section_id, max_marks")
    .eq("id", submission.assignment_id)
    .maybeSingle();

  if (!assignment) return fail("Ye submission nahi mila.", 404);

  const { data: teaches } = await supabase.rpc("teaches_section", {
    p_section: assignment.section_id,
  });

  if (teaches !== true) return fail("Ye submission nahi mila.", 404);

  const max = Number(assignment.max_marks ?? 0);
  const marks = Number(body.marks ?? 0);

  if (max > 0 && (marks < 0 || marks > max)) {
    return fail(`Marks 0 se ${max} ke beech hone chahiye.`, 400);
  }

  const { error } = await db
    .from("assignment_submissions")
    .update({
      marks_obtained: marks,
      feedback: body.feedback?.trim() || null,
      graded_by: user.value,
      graded_at: new Date().toISOString(),
      status: "graded",
    })
    .eq("id", body.submissionId);

  if (error) return fail(`Marks save nahi hue: ${error.message}`, 400);

  const { data: section } = await db
    .from("sections")
    .select("org_id")
    .eq("id", assignment.section_id)
    .maybeSingle();

  /* The one student, not the class. A mark is between the teacher and the
     child, and a "homework marked" line on somebody else's screen is a
     comparison nobody asked for. */
  await notify([submission.student_id as string], {
    orgId: (section?.org_id as string) ?? null,
    kind: "test_result",
    title: max > 0 ? `Homework check ho gaya — ${marks}/${max}` : "Homework check ho gaya",
    body: null,
    link: "/homework",
  });

  await recordAudit(
    {
      orgId: (section?.org_id as string) ?? null,
      actorId: user.value,
      actorRole: "teacher",
      action: "homework.grade",
      entityType: "submission",
      entityId: body.submissionId,
      before: { marks: submission.marks_obtained },
      after: { marks },
    },
    request,
  );

  return NextResponse.json({ graded: true });
}
