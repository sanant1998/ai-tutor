/* Setting homework.
 *
 * ---------------------------------------------------------------------------
 * THE HALF THAT WAS MISSING
 *
 * assignments has existed since schools.sql and assignment_submissions since
 * assessment.sql — policies, column grants, a grading endpoint, a student
 * screen. What no screen or route did was CREATE one, so the whole loop began
 * nowhere: a teacher could be shown an empty homework list forever and there
 * was nothing wrong with any of it.
 *
 * ---------------------------------------------------------------------------
 * A CHAPTER OR A TOPIC, NEVER BOTH
 *
 * The CHECK on the table says so — `(chapter_ref is null) <> (topic_ref is
 * null)` — and it is not arbitrary. "Read chapter 3" and "practise additive
 * inverse" are different instructions at different sizes, and homework that
 * claims to be both is homework a student cannot tell when they have finished.
 */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;
  if (!isAdminConfigured()) return fail("Not configured.", 503);

  let body: {
    sectionId?: string;
    chapterRef?: string | null;
    topicRef?: string | null;
    note?: string;
    dueOn?: string | null;
    maxMarks?: number | null;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  if (!body.sectionId) return fail("sectionId is required.", 400);

  if (Boolean(body.chapterRef) === Boolean(body.topicRef)) {
    return fail("Ek chapter ya ek topic — dono nahi, aur koi nahi bhi nahi.", 400);
  }

  const supabase = await createClient();

  const { data: teaches } = await supabase.rpc("teaches_section", {
    p_section: body.sectionId,
  });

  if (teaches !== true) return fail("Ye section aapka nahi hai.", 403);

  const db = createAdminClient();

  const { data: assignment, error } = await db
    .from("assignments")
    .insert({
      section_id: body.sectionId,
      chapter_ref: body.chapterRef ?? null,
      topic_ref: body.topicRef ?? null,
      note: body.note?.trim() || null,
      due_on: body.dueOn || null,
      max_marks: body.maxMarks ?? null,
      created_by: user.value,
    })
    .select("id")
    .maybeSingle();

  if (error || !assignment) {
    return fail(`Homework set nahi ho paaya: ${error?.message}`, 400);
  }

  /* Everybody in the class hears about it once. Homework set on a Friday and
     discovered on a Monday is homework nobody did — and the app is the only
     place this exists, so silence here means it may as well not have been
     set. */
  const { data: roster } = await db
    .from("section_students")
    .select("student_id")
    .eq("section_id", body.sectionId);

  const { data: section } = await db
    .from("sections")
    .select("org_id, name")
    .eq("id", body.sectionId)
    .maybeSingle();

  await notify(
    (roster ?? []).map((row) => row.student_id as string),
    {
      orgId: (section?.org_id as string) ?? null,
      kind: "assignment_due",
      title: body.dueOn ? `Naya homework — ${body.dueOn} tak` : "Naya homework",
      body: body.note?.trim() || null,
      link: "/homework",
    },
  );

  await recordAudit(
    {
      orgId: (section?.org_id as string) ?? null,
      actorId: user.value,
      actorRole: "teacher",
      action: "homework.set",
      entityType: "assignment",
      entityId: assignment.id as string,
      after: {
        section: section?.name,
        dueOn: body.dueOn ?? null,
        maxMarks: body.maxMarks ?? null,
      },
    },
    request,
  );

  return NextResponse.json({ id: assignment.id, notified: roster?.length ?? 0 });
}
