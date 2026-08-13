/* Session state: where the student is, and pausing.
 *
 * GET is what the tutor screen calls on load, so a student who closes the tab
 * mid-concept comes back to the same beat rather than starting again. */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { LIMITS, minutesElapsed } from "@/lib/pedagogy/beats";
import { applyTransition, loadSession, loadTeachingContext, recentTurns } from "@/lib/tutor/session";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  const { id } = await params;
  const session = await loadSession(id, user.value);
  if (!session) return fail("Session not found.", 404);

  const [context, turns] = await Promise.all([
    loadTeachingContext(session),
    recentTurns(id, 20),
  ]);

  return NextResponse.json({
    sessionId: session.id,
    beat: session.current_beat,
    status: session.status,
    turnsUsed: session.turns_used,
    reteachCount: session.reteach_count,
    minutesElapsed: Math.round(minutesElapsed({ startedAt: session.started_at })),
    topic: context ? { id: session.topic_ref, title: context.topicTitle } : null,
    chapter: context ? context.chapterTitle : null,
    concept: context
      ? { id: context.concept.id, title: context.concept.title, seq: context.concept.seq }
      : null,
    conceptCount: context?.conceptIds.length ?? 0,
    conceptIndex: context ? context.conceptIds.indexOf(session.concept_ref) + 1 : 0,
    limits: { maxTurns: LIMITS.maxTurnsPerConcept, sessionMinutes: LIMITS.sessionMinutes },
    /* The transcript, in order. Verdicts are stripped: they are the server's
       reasoning about the student, and a student reading "student_understood:
       false" about themselves is not a feature. */
    turns: turns.map((turn) => ({
      role: turn.role,
      beat: turn.beat,
      content: turn.content,
      /* The speak route addresses a turn by (session, seq) rather than by its
         text, so the client needs the number. */
      seq: turn.seq,
    })),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  const { id } = await params;
  const session = await loadSession(id, user.value);
  if (!session) return fail("Session not found.", 404);

  let body: { status?: string };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const status = body.status;
  if (status !== "paused" && status !== "active") {
    return fail("status must be 'paused' or 'active'.", 400);
  }

  /* A completed session stays completed. Reopening it would restart a turn
     counter that has already done its job. */
  if (session.status === "completed") {
    return fail("This session is already finished.", 409);
  }

  await applyTransition(id, {
    beat: session.current_beat,
    turnsUsed: session.turns_used,
    reteachCount: session.reteach_count,
    status,
  });

  return NextResponse.json({ sessionId: id, status });
}
