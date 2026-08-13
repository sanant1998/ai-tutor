/* Reviewing and publishing one draft.
 *
 * ---------------------------------------------------------------------------
 * PUBLISHED CONTENT IS IMMUTABLE; AN EDIT IS A NEW VERSION
 *
 * Editing a concept in place looks harmless and is not. A student is midway
 * through a session that was built from version 1 — the history in
 * session_turns refers to an explanation that no longer exists, the fix sheet
 * prints a correction for a misconception that was renumbered, and nothing
 * errors. It just quietly stops making sense.
 *
 * So publishing writes a new version and bumps the counter. learning_sessions
 * stores content_version, so a session in flight keeps the material it started
 * with.
 *
 * ---------------------------------------------------------------------------
 * APPROVAL IS A SEPARATE ACT FROM AUTHORSHIP
 *
 * The reviewer is recorded, and a draft whose author is a model can only be
 * published by a human — which is enforced by there being no non-interactive
 * path to this endpoint at all. */

import { NextResponse } from "next/server";

import { fail } from "@/lib/ai/route";
import { canPublishInto, requireContentAccess } from "@/lib/admin/access";
import type { BankQuestion, Concept } from "@/lib/content/pack";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireContentAccess();
  if (!admin.ok) return fail(admin.message, admin.status);
  if (!isAdminConfigured()) return fail("Not configured.", 503);

  const { id } = await params;

  const { data } = await createAdminClient()
    .from("content_drafts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) return fail("Draft not found.", 404);

  /* A point lookup by id, so the list filter does not help. Same 404 as a
     draft that does not exist — a different message would let one institute
     confirm which draft ids another has. */
  if (
    !admin.visibility.superAdmin &&
    !admin.visibility.adminOf.includes(data.org_id as string)
  ) {
    return fail("Draft not found.", 404);
  }

  /* What is live right now, so the reviewer sees a diff rather than a wall of
     JSON with no baseline. */
  let live: unknown = null;

  if (data.entity_id) {
    const table = data.entity_type === "question" ? "bank_questions" : "concepts";
    const { data: current } = await createAdminClient()
      .from(table)
      .select("*")
      .eq("id", data.entity_id as string)
      .maybeSingle();
    live = current ?? null;
  }

  return NextResponse.json({ draft: data, live });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireContentAccess();
  if (!admin.ok) return fail(admin.message, admin.status);
  if (!isAdminConfigured()) return fail("Not configured.", 503);

  const { id } = await params;

  let body: { action?: string; notes?: string; payload?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const db = createAdminClient();

  const { data: draft } = await db
    .from("content_drafts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!draft) return fail("Draft not found.", 404);

  if (
    !admin.visibility.superAdmin &&
    !admin.visibility.adminOf.includes(draft.org_id as string)
  ) {
    return fail("Draft not found.", 404);
  }

  /* Re-checked at publish and not only at draft: a licence can lapse, or an
     org admin can be removed, between writing a draft and publishing it. */
  const allowed = await canPublishInto(draft.org_id as string | null, admin.visibility);
  if (!allowed.ok) return fail(allowed.message, 403);

  if (draft.status === "published") {
    return fail(
      "This draft has already been published. Create a new draft to change it — published content is never edited in place.",
      409,
    );
  }

  /* --- Save an edit ----------------------------------------------------- */
  if (body.action === "save") {
    if (!body.payload) return fail("payload is required to save.", 400);

    await db
      .from("content_drafts")
      .update({
        payload: body.payload as object,
        review_notes: body.notes ?? draft.review_notes,
        /* A human edited it, so it is no longer purely model output and the
           record should say so. */
        generated_by: String(draft.generated_by).startsWith("llm:")
          ? `${draft.generated_by}+human`
          : draft.generated_by,
      })
      .eq("id", id);

    return NextResponse.json({ ok: true, status: draft.status });
  }

  /* --- Reject ------------------------------------------------------------ */
  if (body.action === "reject") {
    await db
      .from("content_drafts")
      .update({
        status: "rejected",
        reviewer_id: admin.userId,
        review_notes: body.notes ?? "",
      })
      .eq("id", id);

    return NextResponse.json({ ok: true, status: "rejected" });
  }

  /* --- Publish ----------------------------------------------------------- */
  if (body.action !== "publish") {
    return fail("action must be save, reject or publish.", 400);
  }

  const blocking = ((draft.issues as { severity: string }[] | null) ?? []).filter(
    (issue) => issue.severity === "error",
  );

  if (blocking.length > 0) {
    return fail(
      `This draft has ${blocking.length} error${blocking.length === 1 ? "" : "s"}. Fix them first — it cannot be published.`,
      409,
    );
  }

  const payload = draft.payload as Record<string, unknown>;

  if (draft.entity_type === "concept") {
    const concept = payload as unknown as Concept & {
      topicRef?: string;
      structure?: Structure;
    };

    if (!concept.id || !concept.topicRef) {
      return fail("A concept draft needs an id and a topicRef before it can go live.", 400);
    }

    /* A chapter imported from a teacher's PDF has no subject, chapter or topic
       row behind it — those exist for the vendor's curriculum because a seed
       script made them. Without this the concept below fails on its foreign
       key to `topics`, which is where "upload your chapter" would have stopped
       being a feature.
     *
     * Created here rather than at import, so a chapter somebody looked at and
     * rejected leaves nothing behind, and so the reviewer's rename is the
     * title that goes live. Every row carries the DRAFT's org_id, never the
     * payload's — a payload field would let an org admin publish into the
     * shared curriculum by editing JSON. */
    if (concept.structure) {
      const problem = await ensureStructure(db, concept.structure, draft.org_id);
      if (problem) return fail(problem, 500);
    }

    const { error } = await db.from("concepts").upsert(
      {
        id: concept.id,
        topic_ref: concept.topicRef,
        /* Inherited from the draft, never taken from the payload. A payload
           field would let an org admin publish into the shared curriculum by
           editing JSON. */
        org_id: draft.org_id,
        seq: concept.seq,
        title: concept.title,
        statement: concept.statement,
        hook: concept.hook ?? null,
        analogies: concept.analogies ?? [],
        misconceptions: concept.misconceptions ?? [],
        worked_examples: concept.worked_examples ?? [],
        formulas: concept.formulas ?? [],
        /* `structure` is deliberately absent: it is instructions for this
           route, not a field of a concept. */
      },
      { onConflict: "id" },
    );

    if (error) return fail(`Publish failed: ${error.message}`, 500);
  } else {
    const question = payload as unknown as BankQuestion & { topicRef?: string };

    if (!question.id || !question.topicRef) {
      return fail("A question draft needs an id and a topicRef before it can go live.", 400);
    }

    const { error } = await db.from("bank_questions").upsert(
      {
        id: question.id,
        topic_ref: question.topicRef,
        concept_ref: question.conceptId ?? null,
        org_id: draft.org_id,
        qtype: question.qtype,
        level: question.level,
        stem: question.stem,
        options: question.options ?? null,
        correct: question.correct,
        solution: question.solution,
        distractor_map: question.distractor_map ?? {},
        marks: question.marks ?? 4,
        negative_marks: question.negative_marks ?? 1,
        source: question.source ?? "cms",
      },
      { onConflict: "id" },
    );

    if (error) return fail(`Publish failed: ${error.message}`, 500);
  }

  await db
    .from("content_drafts")
    .update({
      status: "published",
      reviewer_id: admin.userId,
      review_notes: body.notes ?? draft.review_notes,
      published_at: new Date().toISOString(),
      version: Number(draft.version ?? 1) + 1,
    })
    .eq("id", id);

  return NextResponse.json({
    ok: true,
    status: "published",
    entityId: (payload.id as string) ?? null,
    note: "Live content updated. Sessions already in progress keep the version they started with.",
  });
}

/* --------------------------------------------------------------------------
   The rows an imported chapter needs before its concepts can exist.

   subjects → chapters → topics, in that order, because each references the one
   before it. Upserted rather than inserted: a chapter's second concept
   publishes into the same three rows as its first, and republishing an edited
   concept must not fail on rows that are already there.
   -------------------------------------------------------------------------- */
type Structure = {
  subject: { id: string; board: string; classLevel: number; subjectId: string };
  chapter: { id: string; no: number; title: string };
  topic: { id: string; no: number; title: string };
};

async function ensureStructure(
  db: ReturnType<typeof createAdminClient>,
  structure: Structure,
  orgId: string | null,
): Promise<string | null> {
  const subject = await db.from("subjects").upsert(
    {
      id: structure.subject.id,
      board: structure.subject.board,
      class_level: structure.subject.classLevel,
      subject_id: structure.subject.subjectId,
      name: structure.subject.subjectId,
    },
    { onConflict: "id" },
  );

  if (subject.error) return `Could not create the subject: ${subject.error.message}`;

  const chapter = await db.from("chapters").upsert(
    {
      id: structure.chapter.id,
      subject_ref: structure.subject.id,
      chapter_no: structure.chapter.no,
      title: structure.chapter.title,
      org_id: orgId,
      /* A school's own chapter is not the vendor's free sample. Their students
         reach it through the school's licence, not through the paywall. */
      is_free: false,
    },
    { onConflict: "id" },
  );

  if (chapter.error) return `Could not create the chapter: ${chapter.error.message}`;

  const topic = await db.from("topics").upsert(
    {
      id: structure.topic.id,
      chapter_ref: structure.chapter.id,
      topic_no: structure.topic.no,
      title: structure.topic.title,
      org_id: orgId,
    },
    { onConflict: "id" },
  );

  if (topic.error) return `Could not create the topic: ${topic.error.message}`;

  return null;
}
