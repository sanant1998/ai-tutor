/* The weekly digest, built once and used twice: by the API the parent's own
   screen reads, and by the cron job that sends it on WhatsApp.

   ---------------------------------------------------------------------------
   WHAT A PARENT GETS, AND WHAT THEY DO NOT

   They get: minutes, accuracy, strong topics, weak topics, one thing to focus
   on next week.

   They do not get the transcript. A parent reading what their child typed at
   eleven at night — the confusion, the "I cannot do this" — changes what
   the child is willing to type. The product only works if a student can be
   honest with it, and that stops the moment the conversation has an audience.

   That is a product decision before it is a privacy one, which is why the
   exclusion is listed in the payload rather than left implicit. A parent
   exercising their statutory right to the data still gets everything, through
   /api/parent/data/[studentId] — a right and a weekly summary are different
   things and are served by different endpoints.

   ---------------------------------------------------------------------------
   WHY THE PROSE IS WRITTEN HERE AND NOT BY A MODEL

   It goes to every parent every week, it is read in about three seconds, and
   it must never be wrong about a number. That is precisely the job to keep
   deterministic — and a model summarising six integers is spending money to
   add a failure mode. */

import "server-only";

import { errorKind, type ErrorType } from "@/lib/mastery";
import { createAdminClient } from "@/lib/supabase/admin";

export type ParentReport = {
  student: { id: string; name: string };
  week: { from: string; to: string };
  headline: string;
  sessions: number;
  minutes: number;
  questions: { attempted: number; correct: number; accuracy: number | null };
  strong: { topic: string; score: number; band: string }[];
  weak: { topic: string; score: number; band: string }[];
  commonMistake: { type: string; name: string; times: number; fix: string } | null;
  action: string;
  /* True when the week was empty. The cron uses it to decide whether to send
     at all — four "0 sessions" messages in a row trains a parent to ignore the
     channel, and the channel is the asset. */
  quiet: boolean;
  excluded: string[];
};

export async function buildParentReport(studentId: string): Promise<ParentReport> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 7 * 86400000).toISOString();

  const [
    { data: sessions },
    { data: attempts },
    { data: mastery },
    { data: errors },
    { data: profile },
  ] = await Promise.all([
    admin
      .from("learning_sessions")
      .select("id, started_at, updated_at, status")
      .eq("user_id", studentId)
      .gte("started_at", since),
    admin
      .from("attempts")
      .select("correct")
      .eq("user_id", studentId)
      .gte("created_at", since),
    admin
      .from("topic_mastery")
      .select("topic_ref, score, band, topics(title)")
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
      /* Capped at the session ceiling. A tab left open for six hours is not
         six hours of study, and a report that claims it is will be believed
         exactly once. */
      return total + Math.min(25, Math.max(0, (end - start) / 60000));
    }, 0),
  );

  const correct = attemptRows.filter((row) => row.correct).length;
  const attempted = attemptRows.length;

  const named = (row: (typeof masteryRows)[number]) => {
    const topic = row.topics as unknown as { title?: string } | { title?: string }[] | null;
    return {
      topic: (Array.isArray(topic) ? topic[0]?.title : topic?.title) ?? "",
      score: Math.round(Number(row.score ?? 0)),
      band: (row.band as string) ?? "Not started",
    };
  };

  const strong = masteryRows.filter((row) => Number(row.score) >= 65).slice(0, 3).map(named);
  const weak = [...masteryRows]
    .sort((a, b) => Number(a.score) - Number(b.score))
    .slice(0, 2)
    .map(named);

  const counts = new Map<ErrorType, number>();
  for (const row of errors ?? []) {
    const type = row.etype as ErrorType;
    if (!type || (type as string) === "none") continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const name = (profile?.first_name as string) || "your child";
  const quiet = sessionRows.length === 0;

  return {
    student: { id: studentId, name },
    week: { from: since.slice(0, 10), to: new Date().toISOString().slice(0, 10) },

    headline: quiet
      ? `${name} did not study at all this week.`
      : `${sessionRows.length} sessions this week, ${minutes} minutes of study.`,

    sessions: sessionRows.length,
    minutes,
    questions: {
      attempted,
      correct,
      accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : null,
    },
    strong,
    weak,

    /* Named in the same taxonomy the student sees, so a parent asking "what is
       a concept gap" gets one answer from both screens. */
    commonMistake: dominant
      ? {
          type: dominant[0],
          name: errorKind(dominant[0]).name,
          times: dominant[1],
          fix: errorKind(dominant[0]).fix,
        }
      : null,

    action: weak[0]
      ? `Next week's focus: ${weak[0].topic}.`
      : quiet
        ? "One short session next week is enough — starting is the hard part."
        : "New topics can start next week.",

    quiet,
    excluded: ["session transcripts", "individual answers", "safety flags"],
  };
}

/* The five template parameters the approved WhatsApp template expects, in
   order. Kept next to the report so the two cannot drift — a reordered
   parameter list produces a message that says the accuracy was 3 and the
   sessions were 68%, and it delivers successfully. */
export function reportTemplateParams(report: ParentReport): string[] {
  return [
    report.student.name,
    String(report.sessions),
    String(report.minutes),
    report.questions.accuracy === null ? "—" : `${report.questions.accuracy}%`,
    report.weak[0]?.topic ?? "every topic is going well",
  ];
}
