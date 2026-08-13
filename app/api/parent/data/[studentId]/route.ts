/* Data rights: see everything, or delete everything.
 *
 * ---------------------------------------------------------------------------
 * WHY BOTH VERBS LIVE IN ONE FILE
 *
 * They share exactly one thing that matters, and it must be identical in both:
 * who is allowed to ask. Splitting them across two routes is how the export
 * ends up with a link check the delete does not have.
 *
 * GET returns a JSON file the student downloads from /privacy. Not a summary
 * and not a dashboard — the right is to a copy of the data, so it contains the
 * rows. That includes the transcripts, which the weekly report deliberately
 * omits: the report is a product decision about what a parent should routinely
 * see, this is a statutory right to what is held.
 *
 * DELETE schedules an erasure rather than performing one. Thirty days, stated
 * on the response, because a mis-tapped button should be recoverable and
 * because some records — an issued tax invoice — cannot lawfully go at all.
 * What is kept and why is returned, not buried. */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

/* The student themselves, and nobody else.
 *
 * This used to also accept a parent holding a confirmed parent_links row. That
 * branch is gone because it became unreachable: a parent has no account (see
 * lib/roles.ts), so nothing can create the row it looked for, and a check that
 * can never pass is worse than no check — it reads like a capability the
 * product has.
 *
 * The right itself is not lost. Every student's own account reaches this from
 * /privacy, which is one tap from anywhere in the app, and the weekly report
 * still goes to the consent-verified phone.
 *
 * What IS narrowed: a guardian can no longer export or erase on the child's
 * behalf without the child's account. If that has to come back, the right
 * shape is a signed link to the consented number — the same mechanism consent
 * itself uses — and not a parent login. */
async function authorised(callerId: string, studentId: string): Promise<boolean> {
  return callerId === studentId;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) {
    return fail("Data export is not configured on this deployment.", 503);
  }

  const { studentId } = await params;
  const admin = createAdminClient();

  if (!(await authorised(user.value, studentId))) {
    return fail("You are not allowed to see this student\u2019s data.", 403);
  }

  /* Every table that holds something about this student. Adding a table to the
     app means adding it here — an export that silently omits a table is not an
     export, and there is no way to notice from the outside. */
  const [
    profile,
    consents,
    sessions,
    turns,
    attempts,
    errors,
    mastery,
    subscriptions,
    invoices,
    voice,
  ] = await Promise.all([
    admin.from("profiles").select("*").eq("id", studentId).maybeSingle(),
    admin.from("consents").select("*").eq("student_id", studentId),
    admin.from("learning_sessions").select("*").eq("user_id", studentId),
    admin.from("session_turns").select("*").eq("user_id", studentId).order("created_at"),
    admin.from("attempts").select("*").eq("user_id", studentId),
    admin.from("error_events").select("*").eq("user_id", studentId),
    admin.from("topic_mastery").select("*").eq("user_id", studentId),
    admin.from("subscriptions").select("*").eq("user_id", studentId),
    admin.from("invoices").select("*").eq("user_id", studentId),
    admin.from("voice_blobs").select("id, session_id, duration_ms, transcript, created_at").eq("user_id", studentId),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    /* Always the student now — see authorised() above. */
    exportedBy: "student",
    student: profile.data ?? null,
    consents: consents.data ?? [],
    learningSessions: sessions.data ?? [],
    conversation: turns.data ?? [],
    attempts: attempts.data ?? [],
    diagnosedErrors: errors.data ?? [],
    mastery: mastery.data ?? [],
    subscriptions: subscriptions.data ?? [],
    invoices: invoices.data ?? [],
    /* The audio itself is not inlined — it would make the file enormous and
       the recordings are deleted at 30 days anyway. The row says what was
       held and when. */
    voiceNotes: voice.data ?? [],
    notIncluded: {
      safetyFlags:
        "Moderation records are held for child-safety purposes and are not disclosed, because disclosure would tell someone how to avoid detection.",
      modelCostLogs:
        "Per-call token counts. These are about our infrastructure, not about the student, and contain no message text.",
    },
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="paperpath-data-${studentId.slice(0, 8)}.json"`,
      /* An export is personal data in a file. It must not sit in any cache. */
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) {
    return fail("Erasure is not configured on this deployment.", 503);
  }

  const { studentId } = await params;
  const admin = createAdminClient();

  if (!(await authorised(user.value, studentId))) {
    return fail("You are not allowed to delete this student\u2019s data.", 403);
  }

  let body: { scope?: string };
  try {
    body = (await request.json()) as { scope?: string };
  } catch {
    body = {};
  }

  const scope = ["all", "transcripts", "voice"].includes(String(body.scope))
    ? String(body.scope)
    : "all";

  const { data: invoices } = await admin
    .from("invoices")
    .select("number")
    .eq("user_id", studentId)
    .limit(1);

  const retained =
    scope === "all" && (invoices?.length ?? 0) > 0
      ? "Tax invoices are retained for the statutory period under Indian accounting rules. They contain a name, an amount and a date, and nothing about the student's learning."
      : null;

  const { data: erasure, error } = await admin
    .from("erasure_requests")
    .insert({
      student_id: studentId,
      requested_by: user.value,
      scope,
      retained_note: retained,
    })
    .select("id, execute_after")
    .maybeSingle();

  if (error || !erasure) {
    return fail("The request could not be recorded. Please try again.", 500);
  }

  /* Processing stops now. The rows go on the timer, but nothing new is
     collected from this moment — waiting thirty days to stop would make the
     request meaningless. */
  if (scope === "all") {
    await admin
      .from("profiles")
      .update({ account_state: "read_only" })
      .eq("id", studentId);

    await admin
      .from("consents")
      .update({ withdrawn_at: new Date().toISOString() })
      .eq("student_id", studentId)
      .is("withdrawn_at", null);

    await admin
      .from("learning_sessions")
      .update({ status: "paused" })
      .eq("user_id", studentId)
      .eq("status", "active");
  }

  /* Voice is deleted immediately rather than scheduled: it is the most
     sensitive thing held, it is never the subject of a mistaken request, and
     nothing downstream depends on it. */
  if (scope === "voice" || scope === "all") {
    await admin.from("voice_blobs").delete().eq("user_id", studentId);
  }

  return NextResponse.json({
    requestId: erasure.id,
    scope,
    /* Not "deleted". Saying so before it has happened is the one thing this
       endpoint must not do. */
    status: "scheduled",
    stopsProcessingImmediately: scope === "all",
    hardDeleteAfter: erasure.execute_after,
    retained,
    cancelBy:
      "You can sign in and cancel this request before that date. After it, the data cannot be recovered.",
  });
}
