/* Setting a test.
 *
 * ---------------------------------------------------------------------------
 * THE TEACHER PICKS A CHAPTER, NOT QUESTIONS
 *
 * A question-by-question builder is the obvious shape and the wrong one for
 * the person using it. A teacher setting Friday's test on Thursday evening
 * does not want to read forty stems and tick twelve; they want "chapter 3,
 * twelve questions, mixed difficulty, due Friday". The bank already knows
 * which questions belong to the chapter and what level each is.
 *
 * So this takes a chapter and a count, and picks. What it does not do is
 * pick randomly: the spread is fixed — a third L1, a third L2, the rest L3 —
 * because a "random twelve" that happens to be all L3 is a test the class
 * fails for reasons that have nothing to do with what they know.
 *
 * ---------------------------------------------------------------------------
 * THE ANSWERS NEVER COME BACK HERE
 *
 * This route selects question ids and writes join rows. It does not return
 * stems, options or `correct`, and the teacher's screen does not ask for
 * them — bank_questions has no select policy for a reason, and a test builder
 * that echoes the paper into a browser is the hole that would make it
 * pointless.
 */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/* A third, a third, the rest. L4 is excluded: it is the stretch band, and a
   whole-class test is not where a student meets one for the first time. */
const SPREAD: Record<string, number> = { L1: 0.34, L2: 0.33, L3: 0.33 };

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;
  if (!isAdminConfigured()) return fail("Not configured.", 503);

  let body: {
    sectionId?: string;
    chapterRef?: string;
    title?: string;
    questionCount?: number;
    kind?: string;
    durationMinutes?: number;
    opensAt?: string | null;
    closesAt?: string | null;
    publish?: boolean;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  if (!body.sectionId || !body.chapterRef) {
    return fail("Both a section and a chapter are required.", 400);
  }

  const supabase = await createClient();

  /* The same check every teacher screen makes, in the database, at the moment
     of asking — not a role, not a cached list. */
  const { data: teaches } = await supabase.rpc("teaches_section", {
    p_section: body.sectionId,
  });

  if (teaches !== true) return fail("This section is not yours.", 403);

  const { data: section } = await supabase
    .from("sections")
    .select("org_id, name")
    .eq("id", body.sectionId)
    .maybeSingle();

  if (!section) return fail("Section not found.", 404);

  const db = createAdminClient();

  /* The bank, read with the service-role key because there is no select policy
     on it and there should not be. Only ids and levels are pulled through —
     the stem and the answer stay on the server. */
  /* Subjective questions are excluded.
     They are marked by a model, so a forty-child class sitting a twelve-
     question test would spend four hundred and eighty model calls on one
     Friday — a different budget conversation from the one this feature is in.
     Everything else marks exactly, instantly and for nothing, off the
     distractor map. When subjective belongs in a class test, it comes back
     with a cost line next to it. */
  const { data: pool, error: poolError } = await db
    .from("bank_questions")
    .select("id, level, topic_ref, topics!inner(chapter_ref)")
    .eq("topics.chapter_ref", body.chapterRef)
    .neq("qtype", "subjective");

  if (poolError) {
    return fail(`The question bank could not be read: ${poolError.message}`, 503);
  }

  const wanted = Math.min(Math.max(Number(body.questionCount ?? 10), 1), 50);

  const byLevel = new Map<string, string[]>();
  for (const question of pool ?? []) {
    const level = (question.level as string) ?? "L2";
    byLevel.set(level, [...(byLevel.get(level) ?? []), question.id as string]);
  }

  const picked: string[] = [];

  for (const [level, share] of Object.entries(SPREAD)) {
    const take = Math.round(wanted * share);
    picked.push(...(byLevel.get(level) ?? []).slice(0, take));
  }

  /* Short of the target because a level is thin — common in a chapter that has
     only just been authored. Topped up from whatever is left rather than
     failing: a ten-question test that came back with seven is still a test,
     and the count is reported so the teacher sees what they got. */
  if (picked.length < wanted) {
    const rest = (pool ?? [])
      .map((question) => question.id as string)
      .filter((id) => !picked.includes(id));

    picked.push(...rest.slice(0, wanted - picked.length));
  }

  if (picked.length === 0) {
    return fail(
      "This chapter has no questions yet. You can set a test once the content team publishes them.",
      409,
    );
  }

  const { data: test, error: testError } = await db
    .from("tests")
    .insert({
      org_id: section.org_id,
      section_id: body.sectionId,
      chapter_ref: body.chapterRef,
      created_by: user.value,
      title: body.title?.trim() || `Test — ${section.name}`,
      kind: body.kind === "exam" ? "exam" : "quiz",
      duration_minutes: body.durationMinutes ?? null,
      total_marks: picked.length,
      attempts_allowed: 1,
      opens_at: body.opensAt ?? null,
      closes_at: body.closesAt ?? null,
      /* Draft unless asked otherwise. A test that publishes itself the moment
         it is created is one a teacher cannot look over first, and the policy
         on tests shows published ones to the whole class immediately. */
      status: body.publish ? "published" : "draft",
    })
    .select("id, status")
    .maybeSingle();

  if (testError || !test) {
    return fail(`The test could not be created: ${testError?.message}`, 400);
  }

  const { error: questionsError } = await db.from("test_questions").insert(
    picked.map((questionRef, index) => ({
      test_id: test.id,
      question_ref: questionRef,
      sort_order: index + 1,
      marks: 1,
    })),
  );

  if (questionsError) {
    /* The paper failed to attach, so the test is an empty shell that would
       show the class a test with no questions. Removed rather than left. */
    await db.from("tests").delete().eq("id", test.id);
    return fail(`The paper could not be built: ${questionsError.message}`, 400);
  }

  /* Only when it is published. A draft is the teacher still thinking, and a
     class told about a test that then changes shape has been told nothing
     useful twice. */
  if (test.status === "published") {
    const { data: roster } = await db
      .from("section_students")
      .select("student_id")
      .eq("section_id", body.sectionId);

    await notify(
      (roster ?? []).map((row) => row.student_id as string),
      {
        orgId: section.org_id as string,
        kind: "test_set",
        title: `Naya test — ${picked.length} questions`,
        body: body.closesAt ? `${new Date(body.closesAt).toLocaleDateString("en-IN")} tak` : null,
        link: "/tests",
      },
    );
  }

  await recordAudit(
    {
      orgId: section.org_id as string,
      actorId: user.value,
      actorRole: "teacher",
      action: "test.create",
      entityType: "test",
      entityId: test.id as string,
      after: {
        chapter: body.chapterRef,
        questions: picked.length,
        status: test.status,
      },
    },
    request,
  );

  return NextResponse.json({
    id: test.id,
    status: test.status,
    questions: picked.length,
    /* Said out loud when the bank could not fill the request, because the
       teacher asked for twelve and is about to set nine. */
    shortBy: picked.length < wanted ? wanted - picked.length : 0,
  });
}
