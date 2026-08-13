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

  const [{ data: overview, error: overviewError }, { data: heatmap }] =
    await Promise.all([
      supabase.rpc("section_overview", { p_section: sectionId }),
      supabase.rpc("section_heatmap", { p_section: sectionId }),
    ]);

  if (overviewError) {
    /* The function raises when the caller does not teach the section, so this
       is the authorisation failure and not a server error. Same message
       whether the section exists or not — a different 404 would let anyone
       enumerate sections. */
    return fail("Ye section aapka nahi hai.", 403);
  }

  const { data: section } = await supabase
    .from("sections")
    .select("id, name, class_level, org_id")
    .eq("id", sectionId)
    .maybeSingle();

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
        }
      : null,

    students: ((overview ?? []) as {
      student_id: string;
      name: string;
      avg_score: number;
      topics_done: number;
      last_active: string | null;
      state: string;
    }[]).map((row) => ({
      id: row.student_id,
      name: row.name,
      score: Number(row.avg_score ?? 0),
      topicsDone: Number(row.topics_done ?? 0),
      lastActive: row.last_active,
      state: row.state,
    })),

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
    return fail("Ek chapter ya ek topic — dono me se ek chuniye.", 400);
  }

  const supabase = await createClient();

  const { data: teaches } = await supabase.rpc("teaches_section", {
    p_section: sectionId,
  });

  if (teaches !== true) return fail("Ye section aapka nahi hai.", 403);

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

  if (error || !data) return fail("Assignment save nahi ho paaya.", 500);

  return NextResponse.json({ assignmentId: data.id, dueOn: data.due_on });
}
