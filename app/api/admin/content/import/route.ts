/* A teacher uploads their chapter; the queue fills with drafts.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * The other way in is a JSON box, and a teacher does not write JSON. The
 * material they actually have is a PDF of the chapter, and the work they
 * actually want done is "read this and make it teachable". So this takes the
 * file, pulls the text out of it, and asks the model for the concepts the
 * chapter genuinely teaches — in the same house style, from the same prompt,
 * as everything else in the curriculum.
 *
 * ---------------------------------------------------------------------------
 * THE MODEL IS NOT BEING TRAINED
 *
 * Worth stating because it is the natural assumption. Nothing here changes the
 * model. The chapter is read once, concepts are written from it, and those
 * concepts are rows in this project's own database — reviewable, editable,
 * deletable. Remove them and the tutor forgets the chapter completely.
 *
 * That is the better shape. A fine-tune would be a black box nobody could
 * inspect, correct or scope to one school; rows can be read by the person
 * responsible for them and are already scoped by org.
 *
 * Once published, the tutor teaches from them and answers a student's
 * questions out of them — that is not a separate feature, it is what
 * lib/tutor/session.ts already does with every concept it loads.
 *
 * ---------------------------------------------------------------------------
 * NOTHING GOES LIVE FROM HERE
 *
 * Every concept lands as a draft. A model reading a mangled PDF and inventing
 * a misconception no child holds is a likely failure, not a hypothetical one,
 * and the only defence is a person reading the draft next to the real page.
 * The import cannot publish, and the review screen still takes one deliberate
 * click per concept. */

import { NextResponse } from "next/server";

import { fail } from "@/lib/ai/route";
import { structured } from "@/lib/ai/client";
import { canPublishInto, requireContentAccess } from "@/lib/admin/access";
import { IMPORT_SCHEMA, IMPORT_SYSTEM } from "@/lib/content/authoring";
import { extractPdf, MAX_SCAN_PAGES, renderPages, type RenderedPage } from "@/lib/content/extract";
import { validateFile } from "@/lib/content/validate";
import type { ContentFile } from "@/lib/content/pack";
import { reportError } from "@/lib/observability";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { targetOrg } from "@/lib/tenancy";

export const runtime = "nodejs";
/* A chapter is a long prompt and the model writes several packs from it. */
export const maxDuration = 300;

type Drafted = {
  chapterTitle: string;
  concepts: Record<string, unknown>[];
};

export async function POST(request: Request) {
  const admin = await requireContentAccess();
  if (!admin.ok) return fail(admin.message, admin.status);

  if (!isAdminConfigured()) return fail("Not configured.", 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Expected a file upload.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return fail("Choose a PDF of the chapter.", 400);

  const orgId = typeof form.get("orgId") === "string" ? String(form.get("orgId")) : null;
  const board = String(form.get("board") ?? "cbse");
  const classLevel = Number(form.get("classLevel") ?? 8);
  const subjectId = String(form.get("subjectId") ?? "maths");
  const chapterNo = Number(form.get("chapterNo") ?? 0);

  /* Whose curriculum this lands in — the author's own org, however the request
     is shaped. An org admin cannot target another org or the shared base. */
  const target = targetOrg(orgId, admin.visibility);
  if ("error" in target) return fail(target.error, 403);

  const allowed = await canPublishInto(target.orgId, admin.visibility);
  if (!allowed.ok) return fail(allowed.message, 403);

  /* --- Read the file ----------------------------------------------------
   *
   * Text layer first, always: exact, instant and free. A scan falls through to
   * the pages being rendered and read by a vision model — slower and billed
   * per page, which is why it is the fallback, but a teacher photographing a
   * textbook is the common case, not the exotic one. */
  const bytes = await file.arrayBuffer();
  const extracted = await extractPdf(bytes);

  let chapterText: string | null = null;
  let images: RenderedPage[] = [];
  let pageCount: number;

  if (extracted.ok) {
    chapterText = extracted.value.text;
    pageCount = extracted.value.pages;
  } else if (extracted.scanned) {
    const rendered = await renderPages(bytes);
    if (!rendered.ok) return fail(rendered.reason, 422);

    images = rendered.pages;
    pageCount = images.length;
  } else {
    return fail(extracted.reason, 422);
  }

  /* --- Ask for the concepts ---------------------------------------------
   *
   * The strong model, always — the same rule scripts/author-concept.ts states
   * and for the same reason: this is one of two places where model output
   * becomes curriculum, and saving a rupee on the draft costs a subject expert
   * twenty minutes of rewriting.
   *
   * Leaving this on the default AI_MODEL was not a small miss. The cheap model
   * this deployment uses for student-facing generation ignores the schema's
   * minItems, so an import came back with one misconception where the pack
   * format requires four — technically a draft, practically a blank page with
   * a title on it. */
  const model = process.env.AI_MODEL_STRONG ?? process.env.AI_MODEL;

  /* Two prompts for two inputs. The scanned one says the pages are IMAGES and
     that a page it cannot read should be left out — a vision model asked to
     read a blurred worked example will produce one rather than admit it. */
  const chapterPrompt = chapterText
    ? `BOARD: ${board}\nCLASS: ${classLevel}\nSUBJECT: ${subjectId}\n\nCHAPTER TEXT (extracted from a PDF, ${pageCount} pages):\n\n${chapterText}`
    : `BOARD: ${board}\nCLASS: ${classLevel}\nSUBJECT: ${subjectId}\n\nThe ${pageCount} images above are the scanned pages of one chapter, in order. Read them and write the concepts the chapter teaches. Where a page is blurred, cut off or unreadable, leave that material out rather than guessing at it.`;

  let drafted: Drafted;

  try {
    drafted = await structured<Drafted>({
      system: IMPORT_SYSTEM,
      prompt: chapterPrompt,
      schema: IMPORT_SCHEMA as unknown as Record<string, unknown>,
      toolName: "deliver_chapter",
      toolDescription: "Return the concepts this chapter teaches.",
      maxTokens: 8192,
      model,
      images: images.length ? images : undefined,
    });
  } catch (error) {
    await reportError("content.import", error, {
      file: file.name,
      pages: pageCount,
      scanned: images.length > 0,
    });

    return fail(
      `The model could not read that chapter: ${error instanceof Error ? error.message : "unknown error"}`,
      502,
    );
  }

  if (!drafted.concepts?.length) {
    return fail(
      "Nothing teachable came out of that file. If it is mostly diagrams or exercises, upload the pages that explain the ideas.",
      422,
    );
  }

  /* --- One repair pass ---------------------------------------------------
   *
   * `minItems` in a JSON schema is a request, not a guarantee. Providers
   * enforce the SHAPE of a tool call — the right keys, the right types — and
   * are inconsistent about array minimums, so a pack can come back valid
   * against the schema and useless against the format: one misconception
   * instead of four, one worked example instead of two.
   *
   * The validator catches that and the draft cannot be published, which is the
   * safety net working. But a queue of unpublishable drafts is not a feature
   * either, and the person who has to fix them is the teacher who uploaded a
   * chapter and expected it to work.
   *
   * So: one bounded retry, naming exactly what is short. Once, not until it
   * complies — a model that ignores the instruction twice will ignore it ten
   * times, and the response tells the teacher what is still missing rather
   * than spending their afternoon on it. */
  const short = describeShortfall(drafted.concepts);

  if (short) {
    try {
      const repaired = await structured<Drafted>({
        system: IMPORT_SYSTEM,
        prompt: `${chapterPrompt}\n\nYour previous attempt was incomplete: ${short}\n\nEvery concept needs EXACTLY four misconceptions (m1-m4) and EXACTLY two worked examples. Produce the same concepts again, complete this time. Do not drop a concept to make this easier.`,
        schema: IMPORT_SCHEMA as unknown as Record<string, unknown>,
        toolName: "deliver_chapter",
        toolDescription: "Return the concepts this chapter teaches, complete.",
        maxTokens: 8192,
        model,
        images: images.length ? images : undefined,
      });

      /* Kept only if it is actually better. A retry that comes back worse —
         fewer concepts, still short — is a retry that should be thrown away. */
      if (
        repaired.concepts?.length >= drafted.concepts.length &&
        !describeShortfall(repaired.concepts)
      ) {
        drafted = repaired;
      }
    } catch {
      /* The first attempt still stands and the validator will mark it. A
         failed repair is not a failed import. */
    }
  }

  /* --- Ids -------------------------------------------------------------- */
  const db = createAdminClient();

  /* Namespaced by org so two schools importing the same chapter cannot collide
     with each other or with the shared curriculum. */
  const scope = target.orgId ? `org-${target.orgId.slice(0, 8)}` : "shared";
  const slug = slugify(drafted.chapterTitle) || `chapter-${Date.now()}`;

  const subjectRef = `${board}-${classLevel}-${subjectId}`;
  const chapterRef = `${scope}-${subjectRef}-${slug}`;
  const topicRef = `${chapterRef}-t1`;

  /* The structure travels with each concept and is created at PUBLISH, not
     here. An import a teacher looks at and rejects should leave no chapter
     behind — and the reviewer may rename it before it goes live. */
  const structure = {
    subject: { id: subjectRef, board, classLevel, subjectId },
    chapter: { id: chapterRef, no: chapterNo || 1, title: drafted.chapterTitle },
    topic: { id: topicRef, no: 1, title: drafted.chapterTitle },
  };

  /* --- File one draft per concept --------------------------------------- */
  const created: { id: string; title: string; issues: number }[] = [];

  for (const [index, concept] of drafted.concepts.entries()) {
    const conceptId = `${topicRef}-c${index + 1}`;

    const payload = {
      ...concept,
      id: conceptId,
      seq: index + 1,
      topicRef,
      /* Read by the publish route, stripped before the concept row is written.
         See app/api/admin/content/[id]/route.ts. */
      structure,
    };

    const issues = validateConcept(payload);

    const { data, error } = await db
      .from("content_drafts")
      .insert({
        entity_type: "concept",
        entity_id: conceptId,
        org_id: target.orgId,
        payload,
        /* Never straight to in_review, however clean it looks. Text from a PDF
           is the least trustworthy input this product has, and a queue that
           marks these the same as hand-written drafts loses the one signal a
           reviewer needs about where to look hardest. */
        status: "draft",
        author_id: admin.userId,
        generated_by: `llm:import:${file.name}`,
        issues,
      })
      .select("id")
      .maybeSingle();

    if (error || !data) {
      await reportError("content.import.save", error, { conceptId });
      continue;
    }

    created.push({
      id: conceptId,
      title: String(concept.title ?? conceptId),
      issues: issues.filter((issue) => issue.severity === "error").length,
    });
  }

  if (created.length === 0) {
    return fail("The concepts were written but none could be saved.", 500);
  }

  const stillShort = describeShortfall(drafted.concepts);

  return NextResponse.json({
    chapterTitle: drafted.chapterTitle,
    pages: pageCount,
    /* Said out loud, because a scan is the lossier path and the reviewer
       should read those drafts against the page more carefully. */
    scanned: images.length > 0,
    truncated: images.length >= MAX_SCAN_PAGES,
    concepts: created,
    /* Surfaced rather than left for the reviewer to discover one draft at a
       time. If the model would not produce a full pack, the teacher should
       know before they start reading. */
    incomplete: stillShort,
    note: stillShort
      ? "Saved as drafts, but some are incomplete — fill in what is missing before publishing."
      : "Saved as drafts. Read each one against the chapter before publishing — nothing is live yet.",
  });
}

/* The same validator the JSON path runs, minus the coverage checks that only
   make sense once a concept has questions pointing at it. */
function validateConcept(payload: Record<string, unknown>) {
  const shell: ContentFile = {
    board: "cbse",
    classLevel: 8,
    subjectId: "maths",
    provenance: { source: "import", verifiedOn: new Date().toISOString().slice(0, 10) },
    subject: { id: "draft", name: "Draft" },
    chapter: { id: "draft-ch", no: 1, title: "Draft" },
    topic: { id: "draft-topic", no: 1, title: "Draft" },
    concepts: [payload as never],
    questions: [],
  };

  const COVERAGE = [
    "No questions at all",
    "questions; ",
    "No L1 question",
    "Nothing above L2",
    "No question distractor maps",
  ];

  return validateFile(shell).filter(
    (issue) =>
      !(
        issue.where.startsWith("concepts ") &&
        COVERAGE.some((phrase) => issue.message.includes(phrase))
      ),
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/* What the pack format requires and the model did not deliver, phrased so it
   can go straight into a retry prompt. Null when everything is complete. */
function describeShortfall(concepts: Record<string, unknown>[]): string | null {
  const problems: string[] = [];

  concepts.forEach((concept, index) => {
    const name = String(concept.title ?? `concept ${index + 1}`);
    const misconceptions = Array.isArray(concept.misconceptions)
      ? concept.misconceptions.length
      : 0;
    const examples = Array.isArray(concept.worked_examples)
      ? concept.worked_examples.length
      : 0;

    if (misconceptions < 4) {
      problems.push(`"${name}" has ${misconceptions} misconception${misconceptions === 1 ? "" : "s"} instead of 4`);
    }
    if (examples < 2) {
      problems.push(`"${name}" has ${examples} worked example${examples === 1 ? "" : "s"} instead of 2`);
    }
  });

  return problems.length > 0 ? problems.join("; ") : null;
}
