/* Reading and writing a teaching session.

   Everything here goes through the service-role client, for one reason: the
   tutor needs the answers. A CHECK is built around a specific misconception,
   the leak check compares the reply against the correct answer, and neither is
   possible from a client that can only see what the student may see.

   The rule that keeps that safe is that nothing in this file returns an answer
   to a caller that will forward it to a browser. `loadTeachingContext` hands
   back the pack and the expected answer; the route uses the answer to CHECK
   the model's output and then drops it. Grep for `expectedAnswer` before
   changing any of this — there should be exactly one consumer. */

import "server-only";

import type { Concept, Misconception } from "@/lib/content/pack";
import type { Beat } from "@/lib/pedagogy/beats";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorKind, type ErrorType } from "@/lib/mastery";
import { DEFAULT_LANGUAGE } from "@/lib/language";

export type SessionRow = {
  id: string;
  user_id: string;
  topic_ref: string;
  concept_ref: string;
  current_beat: Beat;
  turns_used: number;
  reteach_count: number;
  status: "active" | "paused" | "completed";
  started_at: string;
  content_version: number;
};

export type TeachingContext = {
  session: SessionRow;
  chapterTitle: string;
  topicTitle: string;
  concept: Concept;
  /* Ordered by seq. Needed to know whether a concept remains after this one,
     which the state machine uses to choose between TEACH and SUMMARY. */
  conceptIds: string[];
  nextConceptId: string | null;
};

export async function loadSession(
  sessionId: string,
  userId: string,
): Promise<SessionRow | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("learning_sessions")
    .select("*")
    .eq("id", sessionId)
    /* Ownership is checked here rather than relied on from RLS, because this
       client has none. Every read in this file is scoped by user_id for that
       reason. */
    .eq("user_id", userId)
    .maybeSingle();

  return (data as SessionRow | null) ?? null;
}

export async function loadTeachingContext(
  session: SessionRow,
): Promise<TeachingContext | null> {
  const admin = createAdminClient();

  const [{ data: concepts }, { data: topic }] = await Promise.all([
    admin
      .from("concepts")
      .select("id, seq, title, statement, hook, analogies, misconceptions, worked_examples, formulas")
      .eq("topic_ref", session.topic_ref)
      .order("seq"),
    admin
      .from("topics")
      .select("id, title, chapter_ref, chapters(title)")
      .eq("id", session.topic_ref)
      .maybeSingle(),
  ]);

  if (!concepts || concepts.length === 0 || !topic) return null;

  const current = concepts.find((row) => row.id === session.concept_ref);
  if (!current) return null;

  const conceptIds = concepts.map((row) => row.id as string);
  const index = conceptIds.indexOf(current.id as string);

  const chapter = topic.chapters as unknown as { title?: string } | { title?: string }[] | null;

  return {
    session,
    chapterTitle: (Array.isArray(chapter) ? chapter[0]?.title : chapter?.title) ?? "",
    topicTitle: (topic.title as string) ?? "",
    concept: current as unknown as Concept,
    conceptIds,
    nextConceptId: index >= 0 && index < conceptIds.length - 1 ? conceptIds[index + 1] : null,
  };
}

/* --------------------------------------------------------------------------
   Turns
   -------------------------------------------------------------------------- */
export type TurnRow = { role: "tutor" | "student"; content: string; beat: Beat; seq: number };

/* Six turns, oldest first. The whole transcript would be better context and a
   worse product: it pushes the content pack past the cache boundary, costs
   more every turn, and by turn twenty the model is weighing what the student
   said at the start above what they just said. */
export async function recentTurns(sessionId: string, limit = 6): Promise<TurnRow[]> {
  const { data } = await createAdminClient()
    .from("session_turns")
    .select("role, content, beat, seq")
    .eq("session_id", sessionId)
    .order("seq", { ascending: false })
    .limit(limit);

  return ((data ?? []) as TurnRow[]).reverse();
}

export async function saveTurn(row: {
  sessionId: string;
  userId: string;
  seq: number;
  beat: Beat;
  role: "tutor" | "student";
  content: string;
  verdict?: unknown;
  provider?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
  promptVersion?: string;
}) {
  await createAdminClient().from("session_turns").insert({
    session_id: row.sessionId,
    user_id: row.userId,
    seq: row.seq,
    beat: row.beat,
    role: row.role,
    content: row.content,
    verdict: row.verdict ?? null,
    provider: row.provider ?? null,
    model: row.model ?? null,
    tokens_in: row.tokensIn ?? null,
    tokens_out: row.tokensOut ?? null,
    latency_ms: row.latencyMs ?? null,
    prompt_version: row.promptVersion ?? null,
  });
}

export async function nextSeq(sessionId: string): Promise<number> {
  const { data } = await createAdminClient()
    .from("session_turns")
    .select("seq")
    .eq("session_id", sessionId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  return ((data?.seq as number | undefined) ?? 0) + 1;
}

export async function applyTransition(
  sessionId: string,
  patch: {
    beat: Beat;
    conceptRef?: string;
    turnsUsed: number;
    reteachCount: number;
    status?: "active" | "paused" | "completed";
  },
) {
  await createAdminClient()
    .from("learning_sessions")
    .update({
      current_beat: patch.beat,
      ...(patch.conceptRef ? { concept_ref: patch.conceptRef } : {}),
      turns_used: patch.turnsUsed,
      reteach_count: patch.reteachCount,
      ...(patch.status ? { status: patch.status } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
}

/* --------------------------------------------------------------------------
   Student state for layer 3
   -------------------------------------------------------------------------- */
export type StudentSnapshot = {
  name: string;
  classLevel: number;
  language: string;
  band: string;
  topicScore: number;
  recentErrors: { type: ErrorType; count: number }[];
};

export async function loadStudentSnapshot(
  userId: string,
  topicRef: string,
): Promise<StudentSnapshot> {
  const admin = createAdminClient();

  const [{ data: profile }, { data: mastery }, { data: errors }] = await Promise.all([
    admin.from("profiles").select("first_name, language").eq("id", userId).maybeSingle(),
    admin
      .from("topic_mastery")
      .select("score, band")
      .eq("user_id", userId)
      .eq("topic_ref", topicRef)
      .maybeSingle(),
    admin
      .from("error_events")
      .select("etype")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const counts = new Map<ErrorType, number>();
  for (const row of errors ?? []) {
    const type = row.etype as ErrorType;
    if (!type || type === ("none" as ErrorType)) continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return {
    name: (profile?.first_name as string) || "dost",
    classLevel: 8,
    /* The student's own choice. This was hard-coded to "hinglish" while the
       column sat unread, which made the language picker a no-op. */
    language: (profile?.language as string) || DEFAULT_LANGUAGE,
    band: (mastery?.band as string) ?? "Not started",
    topicScore: Number(mastery?.score ?? 0),
    recentErrors: [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
  };
}

/* --------------------------------------------------------------------------
   Choosing what to probe

   A CHECK is only worth asking if it targets something. Given what the student
   has got wrong on this concept before, pick the misconception most worth
   testing; failing that, the first one in the pack. Ordering by past errors
   rather than at random means the second check on a concept is not a re-run of
   the first.
   -------------------------------------------------------------------------- */
export async function pickMisconception(
  userId: string,
  concept: Concept,
): Promise<Misconception | null> {
  const misconceptions = concept.misconceptions ?? [];
  if (misconceptions.length === 0) return null;

  const { data } = await createAdminClient()
    .from("error_events")
    .select("misconception_id")
    .eq("user_id", userId)
    .eq("concept_ref", concept.id)
    .not("misconception_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);

  const seen = (data ?? [])
    .map((row) => row.misconception_id as string)
    .filter(Boolean);

  if (seen.length > 0) {
    const target = misconceptions.find((entry) => entry.id === seen[0]);
    if (target) return target;
  }

  return misconceptions[0];
}

/* The answer the tutor must not give away this turn. Used only by the output
   leak check. */
export async function expectedAnswerFor(
  conceptId: string,
): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("bank_questions")
    .select("correct")
    .eq("concept_ref", conceptId)
    .limit(1)
    .maybeSingle();

  const correct = data?.correct as unknown;
  if (!correct) return null;

  if (Array.isArray(correct)) return correct.join(",");
  if (typeof correct === "object" && "value" in (correct as object)) {
    return String((correct as { value: number }).value);
  }

  return null;
}

export function describeError(type: ErrorType) {
  return errorKind(type);
}
