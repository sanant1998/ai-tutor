/* The content pipeline: draft in, reviewed, published.
 *
 * ---------------------------------------------------------------------------
 * THERE IS NO PATH FROM MODEL TO CURRICULUM WITHOUT A HUMAN
 *
 * A model can write a draft. It cannot publish one — not with a flag, not with
 * a confidence threshold, not "when validation passes". The absence of that
 * path is the feature, and it is the only reason the seeded-curriculum
 * approach is worth anything: the moment a model can publish, the content is
 * model output again and every argument for writing it by hand is gone.
 *
 * So POST creates a draft and PATCH on [id] publishes, and the two are
 * different endpoints with different authorisation for a reason.
 *
 * A draft that fails validation cannot even reach review. There is no point
 * spending a reviewer's attention on a pack whose distractors point at
 * misconceptions that do not exist — the validator says so in a second. */

import { NextResponse } from "next/server";

import { fail } from "@/lib/ai/route";
import { canPublishInto, requireContentAccess } from "@/lib/admin/access";
import { targetOrg } from "@/lib/tenancy";
import { validateFile } from "@/lib/content/validate";
import type { ContentFile } from "@/lib/content/pack";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await requireContentAccess();
  if (!admin.ok) return fail(admin.message, admin.status);

  if (!isAdminConfigured()) return fail("Not configured.", 503);

  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  let query = createAdminClient()
    .from("content_drafts")
    .select("id, entity_type, entity_id, status, generated_by, issues, version, created_at, published_at, review_notes, org_id")
    .order("created_at", { ascending: false })
    .limit(100);

  /* An org admin sees only their own queue. A draft is what a content team is
     still arguing about internally, so it is worse to leak than the published
     version — and the service-role client has no row-level security to fall
     back on. */
  if (!admin.visibility.superAdmin) {
    query = query.in("org_id", admin.visibility.adminOf);
  }

  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) {
    return fail("content_drafts is missing. Run supabase/compliance.sql.", 503);
  }

  const rows = data ?? [];

  return NextResponse.json({
    drafts: rows,
    /* The number worth watching. If most of the curriculum is model-written
       and nobody notices, that is a decision the product made by accident. */
    counts: {
      total: rows.length,
      byStatus: tally(rows.map((row) => row.status as string)),
      modelDrafted: rows.filter((row) => String(row.generated_by).startsWith("llm:")).length,
    },
  });
}

export async function POST(request: Request) {
  const admin = await requireContentAccess();
  if (!admin.ok) return fail(admin.message, admin.status);

  if (!isAdminConfigured()) return fail("Not configured.", 503);

  let body: {
    entityType?: "concept" | "question";
    entityId?: string;
    payload?: unknown;
    generatedBy?: string;
    orgId?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const entityType = body.entityType === "question" ? "question" : "concept";

  if (!body.payload || typeof body.payload !== "object") {
    return fail("payload is required.", 400);
  }

  /* Validated at the door. The validator wants a whole pack, so a bare concept
     is wrapped in the smallest one that will exercise the checks that apply to
     it — and the checks that need a topic around it are skipped rather than
     faked. */
  const issues = validateDraft(entityType, body.payload as Record<string, unknown>);
  const blocking = issues.filter((issue) => issue.severity === "error");

  /* Where this draft belongs. An org admin writes into their own org and
     nowhere else, whatever the request says; a super admin may target one
     explicitly and defaults to the shared base curriculum. */
  const target = targetOrg(body.orgId, admin.visibility);
  if ("error" in target) return fail(target.error, 403);

  const allowed = await canPublishInto(target.orgId, admin.visibility);
  if (!allowed.ok) return fail(allowed.message, 403);

  const { data, error } = await createAdminClient()
    .from("content_drafts")
    .insert({
      entity_type: entityType,
      entity_id: body.entityId ?? null,
      org_id: target.orgId,
      payload: body.payload as object,
      /* Straight to review only when it is clean. Everything else sits in
         draft with the reasons attached. */
      status: blocking.length === 0 ? "in_review" : "draft",
      author_id: admin.userId,
      generated_by: body.generatedBy ?? "human",
      issues,
    })
    .select("id, status")
    .maybeSingle();

  if (error || !data) return fail("Draft save nahi ho paaya.", 500);

  return NextResponse.json({
    draftId: data.id,
    status: data.status,
    orgId: target.orgId,
    issues,
    blocking: blocking.length,
  });
}

function validateDraft(
  entityType: "concept" | "question",
  payload: Record<string, unknown>,
) {
  const shell: ContentFile = {
    board: "cbse",
    classLevel: 8,
    subjectId: "maths",
    provenance: { source: "draft", verifiedOn: new Date().toISOString().slice(0, 10) },
    subject: { id: "draft", name: "Draft" },
    chapter: { id: "draft-ch", no: 1, title: "Draft" },
    topic: { id: "draft-topic", no: 1, title: "Draft" },
    concepts: [],
    questions: [],
  };

  if (entityType === "concept") {
    shell.concepts = [payload as never];
  } else {
    shell.questions = [payload as never];
  }

  /* Coverage checks compare a concept against the questions that target it, and
     a draft holds one entity in isolation — so those checks would fire on
     every draft and mean nothing. They run for real in
     scripts/validate-content.ts once the entity is in a pack.

     Matched on `where` rather than on message text. The previous version
     tested the message for the substring "question", which also matched the
     genuine per-question complaints this screen exists to show — and it did
     so through an && / || precedence mistake that made the whole predicate
     behave differently from how it reads. */
  const COVERAGE_CHECKS = [
    "No questions at all",
    "questions; ",
    "No L1 question",
    "Nothing above L2",
    "No question distractor maps",
  ];

  return validateFile(shell).filter((issue) => {
    const isCoverage =
      issue.where.startsWith("concepts ") &&
      COVERAGE_CHECKS.some((phrase) => issue.message.includes(phrase));

    return !isCoverage;
  });
}

function tally(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}
