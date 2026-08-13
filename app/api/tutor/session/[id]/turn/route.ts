/* One turn of the teaching loop.
 *
 * The order of operations here is the product:
 *
 *   1  safety gate      before a model sees a word of it
 *   2  ceilings         turns, minutes — enforced in code, not in the prompt
 *   3  build            four layers, student's words delimited as data
 *   4  stream           sanitised, verdict held back
 *   5  verify           arithmetic checked, answer-leak checked
 *   6  transition       computed by the server from the verdict
 *
 * Steps 1, 2 and 6 never involve the model in a decision. That is deliberate:
 * a model asked whether to keep going always says yes.
 *
 * ---------------------------------------------------------------------------
 * WHY A CHECK IS BUFFERED AND EVERYTHING ELSE STREAMS
 *
 * Verification can only run on a finished message, and a message already shown
 * cannot be unshown. For teaching beats the answer is to stream and correct:
 * a wrong sum is rare, the correction arrives within a second, and paying two
 * seconds of visible latency on every turn to catch it would be a bad trade.
 *
 * A CHECK is different. The failure there is the tutor giving away the answer,
 * and a student who has read it has read it — a correction afterwards fixes
 * the transcript and not the lesson. Checks are also short, so buffering one
 * costs about a second. So checks are held back until they have been read by
 * the leak detector, and nothing else is. */

import { aiFailure, fail, requireStudent } from "@/lib/ai/route";
import { trackFor, trackSystem } from "@/lib/analytics/server";
import { consume, release } from "@/lib/ai/quota";
import { makeSanitizer } from "@/lib/ai/sanitize";
import { stream } from "@/lib/ai/stream";
import { extractVerdict, pruneUnknownMisconception, SAFE_DEFAULT } from "@/lib/ai/verdict";
import { auditReply } from "@/lib/math/symbolic";
import { nextBeat, reteachStrategy, type SessionState } from "@/lib/pedagogy/beats";
import { buildTutorPrompt } from "@/lib/prompt/tutor";
import { alertParentOfSelfHarm } from "@/lib/safety/escalate";
import { checkOutput, flagOutput, gate } from "@/lib/safety/gate";
import { FIXED_REPLIES, languageOf } from "@/lib/language";
import { reportError } from "@/lib/observability";
import { callerIp, LIMIT_MESSAGE, takeLimit } from "@/lib/ratelimit";
import { sse, sseOnce, type Send } from "@/lib/sse";
import { createClient } from "@/lib/supabase/server";
import { updateTopicMastery } from "@/lib/pedagogy/mastery";
import {
  applyTransition,
  expectedAnswersFor,
  loadSession,
  loadStudentSnapshot,
  loadTeachingContext,
  nextSeq,
  pickMisconception,
  recentTurns,
  saveTurn,
} from "@/lib/tutor/session";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireStudent();
  if (!user.ok) return user.response;

  const { id } = await params;

  let body: { message?: string };
  try {
    body = (await request.json()) as { message?: string };
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const message = String(body.message ?? "").slice(0, 2000).trim();

  const session = await loadSession(id, user.value);
  if (!session) return fail("Session not found.", 404);
  if (session.status === "completed") return fail("Ye session khatam ho chuka hai.", 409);

  /* --- 1. Safety -------------------------------------------------------
     The reply text for every non-allow outcome is fixed in gate.ts. No model
     is asked to phrase a self-harm response, and no model is given the chance
     to be talked out of one. */
  const verdictGate = await gate(message, { userId: user.value, sessionId: id });

  if (verdictGate.action !== "allow") {
    const seq = await nextSeq(id);

    await saveTurn({
      sessionId: id, userId: user.value, seq,
      beat: session.current_beat, role: "student", content: message,
    });
    await saveTurn({
      sessionId: id, userId: user.value, seq: seq + 1,
      beat: session.current_beat, role: "tutor", content: verdictGate.reply ?? "",
    });

    /* An escalation pauses the session. Continuing the lesson under a message
       like that would be the wrong thing to do even if the student asked. */
    if (verdictGate.action === "escalate") {
      await applyTransition(id, {
        beat: session.current_beat,
        turnsUsed: session.turns_used,
        reteachCount: session.reteach_count,
        status: "paused",
      });

      /* And tell the one adult we have a verified number for. The conditions
         and the reasoning are in lib/safety/escalate.ts — self-harm only, the
         consent-verified number only, no content, once a day.

         Awaited rather than fired and forgotten: on a serverless runtime the
         function can be frozen the moment the response is returned, and this
         is the one message in the product that must not be lost to that. */
      if (verdictGate.category === "self_harm") {
        await alertParentOfSelfHarm(user.value, id);
      }
    }

    trackSystem({
      name: "safety_intervention",
      category: verdictGate.category ?? "unknown",
      action: verdictGate.action,
    });

    return sseOnce([
      { event: "text", data: verdictGate.reply ?? "" },
      {
        event: "done",
        data: {
          beat: session.current_beat,
          turnsUsed: session.turns_used,
          intervention: verdictGate.action,
          category: verdictGate.category ?? null,
          paused: verdictGate.action === "escalate",
        },
      },
    ]);
  }

  /* --- 2. Ceilings ------------------------------------------------------ */
  const state: SessionState = {
    currentBeat: session.current_beat,
    turnsUsed: session.turns_used,
    reteachCount: session.reteach_count,
    hasNextConcept: false,
    startedAt: session.started_at,
  };

  const context = await loadTeachingContext(session);
  if (!context) return fail("This topic's content is not seeded.", 409);

  state.hasNextConcept = context.nextConceptId !== null;

  /* Computed before the call so a session at its limit costs nothing. The
     student is told the concept is done, not that they were cut off. */
  const preflight = nextBeat(state, SAFE_DEFAULT);

  if (preflight.forced === "turns" || preflight.forced === "time") {
    const seq = await nextSeq(id);

    /* These are written by us, never by a model, so they need a translation
       rather than an instruction — and a sudden switch of language mid-lesson
       is more jarring than anywhere else in the app. */
    const snapshot = await loadStudentSnapshot(user.value, session.topic_ref);
    const fixed = FIXED_REPLIES[languageOf(snapshot.language).id];

    const reply = preflight.forced === "time" ? fixed.timeLimit : fixed.turnLimit;

    await saveTurn({
      sessionId: id, userId: user.value, seq,
      beat: session.current_beat, role: "student", content: message,
    });
    await saveTurn({
      sessionId: id, userId: user.value, seq: seq + 1,
      beat: "SUMMARY", role: "tutor", content: reply,
    });

    await applyTransition(id, {
      beat: "SUMMARY",
      turnsUsed: session.turns_used + 1,
      reteachCount: session.reteach_count,
    });

    return sseOnce([
      { event: "text", data: reply },
      {
        event: "done",
        data: {
          beat: "SUMMARY",
          turnsUsed: session.turns_used + 1,
          forced: preflight.forced,
        },
      },
    ]);
  }

  /* --- Quota ------------------------------------------------------------
     Two axes. The daily quota bounds what this ACCOUNT spends; the IP limit
     bounds what one person spends across accounts they keep creating. */
  const ipLimit = await takeLimit("tutor_turn", callerIp(request));
  if (!ipLimit.allowed) return fail(LIMIT_MESSAGE, 429);

  const supabase = await createClient();
  const slot = await consume(supabase, user.value, "tutor");
  if (!slot.ok) return fail(slot.message, slot.status);

  /* --- 3. Build --------------------------------------------------------- */
  const [student, history, misconception] = await Promise.all([
    loadStudentSnapshot(user.value, session.topic_ref),
    recentTurns(id, 6),
    session.current_beat === "CHECK"
      ? pickMisconception(user.value, context.concept)
      : Promise.resolve(null),
  ]);

  const prompt = buildTutorPrompt({
    pack: {
      chapterTitle: context.chapterTitle,
      topicTitle: context.topicTitle,
      concept: context.concept,
      targetMisconceptionId: misconception?.id ?? null,
    },
    student,
    beat: {
      beat: session.current_beat,
      reteachCount: session.reteach_count,
      forced: null,
      targetMisconception: misconception
        ? {
            id: misconception.id,
            wrong_belief: misconception.wrong_belief,
            probe: misconception.probe,
          }
        : null,
    },
    history,
    studentMessage: message || "(the student wrote nothing — make a start)",
  });

  const buffered = session.current_beat === "CHECK";
  /* Every answer this concept is examined on, not just the first question's —
     the tutor writes its own check, so any of them is a leak. */
  const expectedAnswers = buffered ? await expectedAnswersFor(context.concept.id) : [];

  /* --- 4-6 -------------------------------------------------------------- */
  return sse(async (send: Send) => {
    const sanitizer = makeSanitizer();
    let visible = "";
    let raw = "";

    let provider = "";
    let model = "";
    let tokensIn = 0;
    let tokensOut = 0;
    let latencyMs = 0;

    const emit = (text: string) => {
      if (!text) return;
      visible += text;
      if (!buffered) send("text", text);
    };

    try {
      const iterator = stream({
        system: prompt.system,
        messages: prompt.messages,
        purpose: session.current_beat === "CHECK" ? "check" : "teach",
        maxTokens: 700,
        temperature: 0.6,
        userId: user.value,
        sessionId: id,
      });

      while (true) {
        const next = await iterator.next();

        if (next.done) {
          const result = next.value;
          provider = result.provider;
          model = result.model;
          tokensIn = result.tokensIn;
          tokensOut = result.tokensOut;
          latencyMs = result.latencyMs;
          break;
        }

        raw += next.value.text;
        emit(sanitizer.push(next.value.text));
      }

      emit(sanitizer.flush());
    } catch (error) {
      /* The slot goes back: a provider outage is not the student's fault and
         should not cost them one of their daily turns. */
      await reportError("tutor.turn.stream", error, {
        sessionId: id,
        beat: session.current_beat,
        conceptId: context.concept.id,
      });

      await release(supabase, "tutor");

      /* aiFailure builds a JSON response, so reading it as text put a raw
         `{"error":"..."}` blob on the student's screen. Parse it, and keep a
         readable sentence for the case where it is not the shape we expect. */
      const response = aiFailure(error);
      const payload = (await response
        .clone()
        .json()
        .catch(() => null)) as { error?: string } | null;

      send("error", {
        message: payload?.error ?? "No reply came back. Try again in a moment.",
      });
      return;
    }

    /* --- 5. Verify ------------------------------------------------------- */
    let text = visible.trim();
    const problems: string[] = [];

    const leak = checkOutput(text, {
      beat: session.current_beat,
      answers: expectedAnswers,
    });

    if (leak) {
      problems.push(leak);
      trackSystem({ name: "output_check_failed", problem: leak, beat: session.current_beat });
      await flagOutput({ userId: user.value, sessionId: id }, leak, text);

      /* A buffered CHECK has not been shown, so it can simply be replaced.
         The replacement is written here rather than regenerated: asking the
         model again for a question that does not contain the answer, having
         just watched it produce one that did, is not a reliable fix. */
      text =
        leak === "answer_leak"
          ? `${misconception?.probe ?? "Here is a question — in your own words, what does this concept mean?"}`
          : "One short question — in your own words, what does this concept mean?";
    }

    /* Exact fractions first, then the symbolic service where one is
       configured. Both are three-state, and only a claim KNOWN to be wrong
       produces a correction — an unverifiable one produces silence. A tutor
       apologising for correct algebra is a worse failure than one that missed
       a wrong sum. */
    const badMaths = await auditReply(text);

    if (badMaths.length > 0) {
      problems.push("arithmetic");
      trackSystem({
        name: "output_check_failed",
        problem: "arithmetic",
        beat: session.current_beat,
      });

      /* Already streamed, so the correction is additive. The client appends it
         to the same bubble; the student sees the tutor catch itself, which
         reads better than a message that silently rewrites itself. */
      const correction = `\n\nOne moment — I wrote a line wrong above: $${badMaths[0].claim}$ is not right (${badMaths[0].detail}). The rest of the explanation stands.`;

      text += correction;
      if (!buffered) send("text", correction);
    }

    if (buffered) send("text", text);

    /* --- 6. Transition --------------------------------------------------- */
    const verdict = pruneUnknownMisconception(
      extractVerdict(raw),
      (context.concept.misconceptions ?? []).map((entry) => entry.id),
    );

    /* The single most useful health metric on this route. A weak model quietly
       stops emitting the verdict block, every transition then falls back to
       "did not understand", and the only visible symptom is that students
       start getting reteaches they did not earn. */
    if (!raw.includes("<verdict>")) {
      trackSystem({ name: "verdict_parse_failed", beat: session.current_beat, model });
    }

    const transition = nextBeat(
      { ...state, turnsUsed: session.turns_used + 1 },
      verdict,
    );

    const seq = await nextSeq(id);

    await saveTurn({
      sessionId: id, userId: user.value, seq,
      beat: session.current_beat, role: "student", content: message,
      promptVersion: prompt.promptVersion,
    });

    await saveTurn({
      sessionId: id,
      userId: user.value,
      seq: seq + 1,
      beat: session.current_beat,
      role: "tutor",
      content: text,
      verdict: { ...verdict, problems },
      provider,
      model,
      tokensIn,
      tokensOut,
      latencyMs,
      promptVersion: prompt.promptVersion,
    });

    const reteachCount = transition.resetReteach
      ? 0
      : session.reteach_count + (transition.countReteach ? 1 : 0);

    await applyTransition(id, {
      beat: transition.beat,
      conceptRef: transition.advanceConcept
        ? (context.nextConceptId ?? undefined)
        : undefined,
      turnsUsed: transition.advanceConcept ? 0 : session.turns_used + 1,
      reteachCount,
      status: transition.beat === "DONE" ? "completed" : "active",
    });

    /* Teaching counts towards mastery only once the concept has been closed,
       so a student who opens a session and leaves does not bank 30 points. */
    if (transition.beat === "SUMMARY" || transition.beat === "DONE") {
      await updateTopicMastery(user.value, session.topic_ref, { teachDone: true });
    }

    await trackFor(user.value, {
      name: "beat_advanced",
      sessionId: id,
      from: session.current_beat,
      to: transition.beat,
      turnsUsed: session.turns_used + 1,
    });

    if (transition.countReteach) {
      await trackFor(user.value, {
        name: transition.downshift ? "downshift_triggered" : "reteach_entered",
        sessionId: id,
        conceptId: context.concept.id,
        ...(transition.downshift
          ? {}
          : { attempt: reteachCount, strategy: reteachStrategy(reteachCount) }),
      } as never);
    }

    send("done", {
      beat: transition.beat,
      turnsUsed: transition.advanceConcept ? 0 : session.turns_used + 1,
      reteachCount,
      conceptAdvanced: transition.advanceConcept,
      forced: transition.forced,
      quota: slot.quota,
      /* Not shown to the student — used by the eval harness and the dev
         console to see what the server decided and why. */
      debug: { verdict, problems, provider, model, latencyMs },
    });
  });
}
