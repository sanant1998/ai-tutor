/* The weekly parent report.
 *
 * ---------------------------------------------------------------------------
 * WHAT A PARENT GETS, AND WHAT THEY DO NOT
 *
 * They get: minutes studied, accuracy, which topics are strong, which are
 * weak, and one thing to focus on next week.
 *
 * They do not get: the transcript. A parent reading what their child typed to
 * a tutor at eleven at night — the confusion, the frustration, the "main ye
 * nahi kar sakta" — changes what the child is willing to type. The product
 * only works if the student can be honest with it, and that stops the moment
 * the conversation has an audience.
 *
 * That is a product decision as much as a privacy one, and it is why this
 * route reads aggregates and never touches session_turns.
 *
 * ---------------------------------------------------------------------------
 * AUTHORISATION
 *
 * The service-role client bypasses RLS, so the link check below IS the access
 * control. It must come first, it must require confirmation by the student
 * side, and the studentId from the URL must never be used before it passes. */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { errorKind, type ErrorType } from "@/lib/mastery";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) {
    return fail("Parent reporting is not configured on this deployment.", 503);
  }

  const { studentId } = await params;
  const admin = createAdminClient();

  /* --- Authorisation ---------------------------------------------------- */
  const { data: link } = await admin
    .from("parent_links")
    .select("relation, confirmed")
    .eq("parent_id", user.value)
    .eq("student_id", studentId)
    .maybeSingle();

  if (!link) {
    /* Deliberately the same message whether the student exists or not: a
       different 404 would let anyone enumerate accounts. */
    return fail("Aapka is student se koi link nahi hai.", 403);
  }

  if (!link.confirmed) {
    return fail(
      "Student ne abhi link confirm nahi kiya. Unke account pe request bheji gayi hai.",
      403,
    );
  }

  /* --- The week --------------------------------------------------------- */
  const since = new Date(Date.now() - 7 * 86400000).toISOString();

  const [{ data: sessions }, { data: attempts }, { data: mastery }, { data: errors }, { data: profile }] =
    await Promise.all([
      admin
        .from("learning_sessions")
        .select("id, started_at, updated_at, status, topic_ref")
        .eq("user_id", studentId)
        .gte("started_at", since),
      admin
        .from("attempts")
        .select("correct, level, created_at")
        .eq("user_id", studentId)
        .gte("created_at", since),
      admin
        .from("topic_mastery")
        .select("topic_ref, score, band, next_review_at, topics(title)")
        .eq("user_id", studentId)
        .order("score", { ascending: false }),
      admin
        .from("error_events")
        .select("etype")
        .eq("user_id", studentId)
        .gte("created_at", since),
      admin.from("profiles").select("first_name").eq("id", studentId).maybeSingle(),
    ]);

  const sessionRows = sessions ?? [];
  const attemptRows = attempts ?? [];
  const masteryRows = mastery ?? [];

  const minutes = Math.round(
    sessionRows.reduce((total, row) => {
      const start = new Date(row.started_at as string).getTime();
      const end = new Date(row.updated_at as string).getTime();
      /* Cap a single session at the session ceiling. A tab left open for six
         hours is not six hours of study, and a report that says it is will be
         believed exactly once. */
      return total + Math.min(25, Math.max(0, (end - start) / 60000));
    }, 0),
  );

  const right = attemptRows.filter((row) => row.correct).length;
  const total = attemptRows.length;
  const accuracy = total > 0 ? Math.round((right / total) * 100) : null;

  const named = (row: (typeof masteryRows)[number]) => {
    const topic = row.topics as unknown as { title?: string } | { title?: string }[] | null;
    return {
      topic: (Array.isArray(topic) ? topic[0]?.title : topic?.title) ?? "",
      score: Math.round(Number(row.score ?? 0)),
      band: row.band as string,
    };
  };

  const strong = masteryRows.filter((row) => Number(row.score) >= 65).slice(0, 3).map(named);
  const weak = [...masteryRows].sort((a, b) => Number(a.score) - Number(b.score)).slice(0, 2).map(named);

  const errorCounts = new Map<ErrorType, number>();
  for (const row of errors ?? []) {
    const type = row.etype as ErrorType;
    if (!type || (type as string) === "none") continue;
    errorCounts.set(type, (errorCounts.get(type) ?? 0) + 1);
  }

  const dominant = [...errorCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const name = (profile?.first_name as string) || "aapke bachche";

  /* --- The message ------------------------------------------------------
     Written here rather than by a model. It goes out weekly to every parent,
     it will be read in three seconds, and it must never be wrong about a
     number — which is exactly the job to keep deterministic. */
  const headline =
    sessionRows.length === 0
      ? `Is hafte ${name} ne koi session nahi kiya.`
      : `Is hafte ${sessionRows.length} session, ${minutes} minute padhai.`;

  const action = weak[0]
    ? `Agle hafte ka focus: ${weak[0].topic}.`
    : "Agle hafte naye topics shuru kar sakte hain.";

  return NextResponse.json({
    student: { id: studentId, name },
    week: { from: since.slice(0, 10), to: new Date().toISOString().slice(0, 10) },
    headline,
    sessions: sessionRows.length,
    minutes,
    questions: { attempted: total, correct: right, accuracy },
    strong,
    weak,
    /* Named in the taxonomy the student sees too, so a parent asking "what is
       a concept gap" gets the same answer from both screens. */
    commonMistake: dominant
      ? { type: dominant[0], name: errorKind(dominant[0]).name, times: dominant[1], fix: errorKind(dominant[0]).fix }
      : null,
    action,
    /* Never included, and named here so a future edit has to be deliberate. */
    excluded: ["session transcripts", "individual answers", "safety flags"],
  });
}
