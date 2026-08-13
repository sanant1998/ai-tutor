/* What a teacher sees about their class.
 *
 * ---------------------------------------------------------------------------
 * AGGREGATES ONLY, AND THE AUTHORISATION IS IN POSTGRES
 *
 * Every query here goes through a security-definer function that re-checks the
 * caller teaches this section, at the moment they ask. That is deliberate: the
 * alternative — a broad row-level policy letting teachers read student rows —
 * is written once, never read again, and quietly keeps working for a teacher
 * who left in March.
 *
 * A teacher can see that eleven students are stuck on additive inverse and
 * which wrong belief they hold. They cannot read a session transcript, and
 * there is no endpoint that would let them. */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import type { Misconception } from "@/lib/content/pack";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  const { sectionId } = await params;

  /* The user's own client, not the admin one. These functions are security
     definer and read auth.uid() to check the caller teaches the section — with
     the service-role key auth.uid() is null and the check cannot run. */
  const supabase = await createClient();

  /* section_roster is the register — name, admission number, roll number — and
     nothing about how the child is doing. Kept apart from section_overview on
     purpose: the school office needs the register and the teacher needs the
     performance, and a single function returning both cannot be granted to one
     without the other.

     Its error is swallowed rather than fatal. On a database where
     schoolops.sql has not run the function does not exist, and a teacher
     losing their whole heatmap because the register is missing would be the
     wrong failure. */
  const [{ data: overview, error: overviewError }, { data: heatmap }, { data: roster }] =
    await Promise.all([
      supabase.rpc("section_overview", { p_section: sectionId }),
      supabase.rpc("section_heatmap", { p_section: sectionId }),
      supabase.rpc("section_roster", { p_section: sectionId }),
    ]);

  if (overviewError) {
    /* The function raises when the caller does not teach the section, so this
       is the authorisation failure and not a server error. Same message
       whether the section exists or not — a different 404 would let anyone
       enumerate sections. */
    return fail("That section is not yours.", 403);
  }

  const { data: section } = await supabase
    .from("sections")
    .select("id, name, class_level, org_id")
    .eq("id", sectionId)
    .maybeSingle();

  /* Tests set for this class, and how it went.
     Read through the caller's own client, so the policy decides: a teacher
     sees their section's tests including drafts, a student sees only published
     ones. The results come from test_results(), which re-checks the caller
     teaches the section — the same pattern as everything else on this screen,
     and the reason a teacher cannot pass another section's test id here. */
  const { data: tests } = await supabase
    .from("tests")
    .select("id, title, kind, status, total_marks, opens_at, closes_at")
    .eq("section_id", sectionId)
    .order("created_at", { ascending: false })
    .limit(10);

  /* Two hops rather than a join, because chapters are keyed by subject_ref and
     the class level lives on subjects. Cheap: a class has one syllabus. */
  const { data: subjectRows } = await supabase
    .from("subjects")
    .select("id")
    .eq("class_level", section?.class_level ?? 0);

  const { data: chapterRows } = subjectRows?.length
    ? await supabase
        .from("chapters")
        .select("id, title, chapter_no, subject_ref")
        .in(
          "subject_ref",
          subjectRows.map((row) => row.id as string),
        )
        .order("chapter_no")
    : { data: [] };

  const chapters = (chapterRows ?? []).map((row) => ({
    ref: row.id as string,
    title: `${row.chapter_no}. ${row.title}`,
  }));

  /* Where these children were last year.
     promote_section() has written this row at every year end and nothing has
     ever read it — which made the history exactly as useful as not keeping it.
     It answers the question a teacher asks in April: is this class new to me,
     or did they come up together from 7-A?

     Read with the caller's own client, so the policy decides: a student sees
     their own row, an org admin sees the school's. A teacher sees neither
     directly — which is why this is filtered to the students of a section they
     have already been authorised for, above. */
  const { data: history } = await supabase
    .from("student_section_history")
    .select("student_id, section_id, status, academic_year_id")
    .in(
      "student_id",
      ((overview ?? []) as { student_id: string }[]).map((row) => row.student_id),
    );

  const previousSectionIds = [
    ...new Set((history ?? []).map((row) => row.section_id as string)),
  ];

  const { data: previousSections } = previousSectionIds.length
    ? await supabase.from("sections").select("id, name").in("id", previousSectionIds)
    : { data: [] };

  const previousName = new Map(
    (previousSections ?? []).map((row) => [row.id as string, row.name as string]),
  );

  const testResults = await Promise.all(
    (tests ?? []).map(async (test) => {
      const { data: results } = await supabase.rpc("test_results", { p_test: test.id });

      const rows = (results ?? []) as {
        student_id: string;
        name: string;
        score: number | null;
        max_score: number | null;
        submitted_at: string | null;
        status: string;
      }[];

      const submitted = rows.filter((row) => row.submitted_at);

      return {
        id: test.id as string,
        title: test.title as string,
        kind: test.kind as string,
        status: test.status as string,
        /* Sat, not set. A test with thirty attempts and four submissions is a
           test the class abandoned halfway, which is a different problem from
           one nobody opened. */
        attempts: rows.length,
        submitted: submitted.length,
        average:
          submitted.length > 0
            ? Math.round(
                submitted.reduce((total, row) => total + Number(row.score ?? 0), 0) /
                  submitted.length,
              )
            : null,
        outOf: submitted[0]?.max_score ?? (test.total_marks as number | null),
      };
    }),
  );

  /* Turn a misconception id into the belief a teacher can act on. Without
     this the heatmap says "m1", which is a database key and not a lesson
     plan. */
  const rows = (heatmap ?? []) as {
    topic_ref: string;
    title: string;
    class_avg: number;
    struggling: number;
    attempted: number;
    top_misconception: string | null;
  }[];

  const beliefs = await resolveMisconceptions(rows);

  return NextResponse.json({
    section: section
      ? {
          id: section.id as string,
          name: section.name as string,
          classLevel: section.class_level as number | null,
          /* The teacher's notice box posts to /api/announcements, which needs
             the org — and a client component cannot ask which org a section
             belongs to without another round trip. */
          orgId: section.org_id as string,
        }
      : null,

    students: ((overview ?? []) as {
      student_id: string;
      name: string;
      avg_score: number;
      topics_done: number;
      last_active: string | null;
      state: string;
    }[]).map((row) => {
      const record = ((roster ?? []) as {
        student_id: string;
        admission_number: string | null;
        roll_number: string | null;
      }[]).find((entry) => entry.student_id === row.student_id);

      return {
        id: row.student_id,
        name: row.name,
        score: Number(row.avg_score ?? 0),
        topicsDone: Number(row.topics_done ?? 0),
        lastActive: row.last_active,
        state: row.state,
        /* The identifiers the school actually uses in its own registers. A
           teacher looking for "roll 17" cannot find them by first name, and
           the name is all this screen had. Null for a student the office has
           not entered a record for yet, which is most of them on day one. */
        admissionNumber: record?.admission_number ?? null,
        rollNumber: record?.roll_number ?? null,
        /* Last year's class, if they were promoted into this one. Null for a
           child who joined this year, which is the honest difference between
           "new to the school" and "new to me". */
        cameFrom:
          previousName.get(
            ((history ?? []) as { student_id: string; section_id: string }[]).find(
              (entry) => entry.student_id === row.student_id,
            )?.section_id ?? "",
          ) ?? null,
      };
    }),

    heatmap: rows.map((row) => ({
      topicId: row.topic_ref,
      title: row.title,
      classAverage: Number(row.class_avg ?? 0),
      struggling: Number(row.struggling ?? 0),
      attempted: Number(row.attempted ?? 0),
      /* The single most useful line on the screen: not "the class is weak on
         this" but "the class believes this specific wrong thing", which is
         something a teacher can open tomorrow's lesson with. */
      commonBelief: row.top_misconception
        ? (beliefs.get(`${row.topic_ref}:${row.top_misconception}`) ?? null)
        : null,
    })),

    tests: testResults,

    /* What this class can be tested on. Read through the caller's own client,
       so the tenancy policy decides which chapters exist for them — the shared
       base curriculum plus their own institute's, and never another
       institute's. Filtered to the section's class level, because a Class 8
       teacher setting a test does not want to scroll past Class 10. */
    chapters: chapters ?? [],
  });
}

async function resolveMisconceptions(
  rows: { topic_ref: string; top_misconception: string | null }[],
): Promise<Map<string, { belief: string; correction: string }>> {
  const out = new Map<string, { belief: string; correction: string }>();
  const topicIds = rows.filter((row) => row.top_misconception).map((row) => row.topic_ref);

  if (topicIds.length === 0 || !isAdminConfigured()) return out;

  /* The concept pack is global curriculum content, not student data, so the
     admin client is the right tool here — there is nothing to scope. */
  const { data: concepts } = await createAdminClient()
    .from("concepts")
    .select("topic_ref, misconceptions")
    .in("topic_ref", topicIds);

  for (const concept of concepts ?? []) {
    for (const misconception of (concept.misconceptions as Misconception[]) ?? []) {
      out.set(`${concept.topic_ref}:${misconception.id}`, {
        belief: misconception.wrong_belief,
        correction: misconception.correction,
      });
    }
  }

  return out;
}

/* Setting work. A teacher assigning a chapter with a deadline is the most
   requested B2B feature and the cheapest to build — the tutor already knows
   how to teach a topic, this only says which and by when. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  const { sectionId } = await params;

  let body: { chapterId?: string; topicId?: string; dueOn?: string; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  if (Boolean(body.chapterId) === Boolean(body.topicId)) {
    return fail("Choose either a chapter or a topic, not both.", 400);
  }

  const supabase = await createClient();

  const { data: teaches } = await supabase.rpc("teaches_section", {
    p_section: sectionId,
  });

  if (teaches !== true) return fail("That section is not yours.", 403);

  const { data, error } = await supabase
    .from("assignments")
    .insert({
      section_id: sectionId,
      chapter_ref: body.chapterId ?? null,
      topic_ref: body.topicId ?? null,
      due_on: body.dueOn ?? null,
      note: body.note?.slice(0, 500) ?? null,
      created_by: user.value,
    })
    .select("id, due_on")
    .maybeSingle();

  if (error || !data) return fail("The assignment could not be saved.", 500);

  return NextResponse.json({ assignmentId: data.id, dueOn: data.due_on });
}
