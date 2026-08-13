/* The tests set for this student.
 *
 * Read through the student's own client, so the policy on `tests` is what
 * decides: published, and set for a section they are in. Drafts a teacher is
 * still writing are invisible here for the same reason they are invisible in
 * the database — one rule, in one place.
 *
 * Attempts are counted so the list can say "already done" rather than letting
 * a student open a test they cannot submit. That is a courtesy, not a control:
 * the control is in the start endpoint, which counts the same rows server-side
 * and refuses.
 */

import { NextResponse } from "next/server";

import { requireStudent } from "@/lib/ai/route";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireStudent();
  if (!user.ok) return user.response;

  const supabase = await createClient();

  const { data: tests, error } = await supabase
    .from("tests")
    .select("id, title, kind, duration_minutes, total_marks, attempts_allowed, opens_at, closes_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    /* assessment.sql has not run. An empty list is the honest answer and the
       page says so; failing the route would take the whole screen down. */
    return NextResponse.json({ tests: [] });
  }

  const { data: attempts } = await supabase
    .from("test_attempts")
    .select("test_id, score, max_score, submitted_at")
    .eq("student_id", user.value);

  const now = Date.now();

  return NextResponse.json({
    tests: (tests ?? []).map((test) => {
      const mine = (attempts ?? []).filter((attempt) => attempt.test_id === test.id);
      const done = mine.filter((attempt) => attempt.submitted_at);
      const best = done.reduce<number | null>(
        (top, attempt) => Math.max(top ?? 0, Number(attempt.score ?? 0)),
        null,
      );

      const opensAt = test.opens_at ? new Date(test.opens_at as string).getTime() : null;
      const closesAt = test.closes_at ? new Date(test.closes_at as string).getTime() : null;

      return {
        id: test.id as string,
        title: test.title as string,
        kind: test.kind as string,
        durationMinutes: test.duration_minutes as number | null,
        outOf: (test.total_marks as number | null) ?? null,
        attemptsUsed: mine.length,
        attemptsAllowed: Number(test.attempts_allowed ?? 1),
        bestScore: best,
        notYetOpen: opensAt !== null && opensAt > now,
        closed: closesAt !== null && closesAt < now,
        opensAt: test.opens_at as string | null,
        closesAt: test.closes_at as string | null,
      };
    }),
  });
}
