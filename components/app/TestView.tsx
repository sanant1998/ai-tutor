"use client";

/* Sitting a test.
 *
 * ---------------------------------------------------------------------------
 * HOW THIS DIFFERS FROM PRACTICE, ON PURPOSE
 *
 * Practice marks each answer as it is given, because the point of practice is
 * the correction arriving while the thinking is still warm. A test cannot do
 * that: a student who learns question three was wrong will change question
 * four, and the score stops meaning anything.
 *
 * So: every question on one page, nothing marked until submit, and the whole
 * paper marked at once by the server. The student can move around and change
 * their mind, which is what a paper allows and what a one-at-a-time flow with
 * no going back takes away.
 *
 * ---------------------------------------------------------------------------
 * THE TIMER DOES NOT SUBMIT
 *
 * It counts down and it goes red, and when it reaches zero it says so. It does
 * not wipe the screen or auto-submit, because a fourteen-year-old on a phone
 * with a bad connection losing an hour's work to a clock is a support call
 * that ends a pilot. The window is enforced server-side by closes_at; this is
 * a reminder, not a guillotine. */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, Clock, Loader2, X } from "lucide-react";

import { Maths, TutorMessage } from "@/components/app/Maths";
import { Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { acc, text } from "@/lib/theme";

type Question = {
  ref: string;
  order: number;
  marks: number;
  qtype: "mcq" | "msq" | "nvt" | "subjective";
  stem: string;
  options: { key: string; text: string }[] | null;
};

type Result = {
  ref: string;
  correct: boolean;
  marksAwarded: number;
  marks: number;
  feedback: string;
  solution: string;
};

export function TestView({ testId }: { testId: string }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [title, setTitle] = useState("");
  const [attemptId, setAttemptId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string[] | string>>({});
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [score, setScore] = useState<{ score: number; outOf: number } | null>(null);

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const response = await fetch(`/api/tests/${testId}/start`, { method: "POST" });
        const payload = await response.json();

        if (!live) return;

        if (!response.ok) {
          setError(payload.error ?? "This test could not be opened.");
          return;
        }

        setQuestions(payload.questions ?? []);
        setTitle(payload.title ?? "Test");
        setAttemptId(payload.attemptId);

        if (payload.durationMinutes) {
          setDeadline(Date.now() + Number(payload.durationMinutes) * 60_000);
        }
      } catch {
        if (live) setError("Network problem.");
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, [testId]);

  /* Ticks only while a paper is open. Null until mount so the server and the
     client never disagree about the time on first paint. */
  useEffect(() => {
    if (!deadline || results) return;

    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline, results]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/tests/${testId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, answers }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "That could not be submitted.");
        return;
      }

      setResults(payload.questions ?? []);
      setScore({ score: payload.score, outOf: payload.outOf });
    } catch {
      setError("Network problem — try again. Your answers are still here.");
    } finally {
      setSubmitting(false);
    }
  }, [testId, attemptId, answers]);

  const answered = useMemo(
    () => questions.filter((question) => answers[question.ref] !== undefined).length,
    [questions, answers],
  );

  const remaining = deadline && now ? Math.max(0, deadline - now) : null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12" style={{ color: text(0.5) }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-[14px]">Opening the test…</span>
      </div>
    );
  }

  if (error && questions.length === 0) {
    return (
      <Panel className="space-y-3 p-6">
        <p className="flex items-center gap-2 text-[15px]" style={{ color: text(0.8) }}>
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
        <Link href="/tests" className="text-[14px] underline" style={{ color: acc() }}>
          Back to tests
        </Link>
      </Panel>
    );
  }

  /* --- Marked --------------------------------------------------------- */
  if (results && score) {
    return (
      <div className="space-y-5">
        <Panel className="p-6">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: text(0.45) }}>
            {title}
          </p>
          <p className="font-display mt-2 text-[2.4rem] font-extrabold tracking-[-0.03em]" style={{ color: text() }}>
            {score.score}/{score.outOf}
          </p>
          <p className="mt-1 text-[14px]" style={{ color: text(0.6) }}>
            Your teacher can see this result.
          </p>
        </Panel>

        {results.map((result, index) => {
          const question = questions.find((entry) => entry.ref === result.ref);

          return (
            <Panel key={result.ref} className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="font-mono text-[12px]" style={{ color: text(0.45) }}>
                  Q{index + 1}
                </span>
                <span
                  className="flex items-center gap-1.5 text-[13px] font-bold"
                  style={{ color: result.correct ? "#16a34a" : "#dc2626" }}
                >
                  {result.correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  {result.marksAwarded}/{result.marks}
                </span>
              </div>

              {question && <TutorMessage body={question.stem} />}

              {/* The belief behind the wrong answer, before the solution. A
                  student who reads the working first reads it as "oh, of
                  course" and learns nothing; naming what they actually did is
                  what makes the next one different. */}
              {!result.correct && (
                <p
                  className="rounded-xl px-3 py-2.5 text-[13.5px]"
                  style={{ background: acc(0.09), color: text(0.8) }}
                >
                  {result.feedback}
                </p>
              )}

              <TutorMessage body={result.solution} />
            </Panel>
          );
        })}

        <Link href="/tests" className="inline-block text-[14px] underline" style={{ color: acc() }}>
          Other tests
        </Link>
      </div>
    );
  }

  /* --- Sitting it ------------------------------------------------------ */
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: text(0.45) }}>
            Test
          </p>
          <h1 className="font-display mt-1 text-[1.8rem] font-extrabold tracking-[-0.03em]" style={{ color: text() }}>
            {title}
          </h1>
        </div>

        {remaining !== null && (
          <span
            className="flex items-center gap-1.5 font-mono text-[15px] font-bold"
            style={{ color: remaining < 120_000 ? "#dc2626" : text(0.7) }}
          >
            <Clock className="h-4 w-4" />
            {remaining === 0
              ? "Time up"
              : `${Math.floor(remaining / 60_000)}:${String(Math.floor((remaining % 60_000) / 1000)).padStart(2, "0")}`}
          </span>
        )}
      </div>

      {remaining === 0 && (
        <p className="rounded-xl px-4 py-3 text-[13.5px]" style={{ background: acc(0.1), color: text(0.8) }}>
          Time is up — but your work is still here. Go ahead and submit it.
        </p>
      )}

      {questions.map((question, index) => {
        const given = answers[question.ref];
        const chosen = Array.isArray(given) ? given : [];

        return (
          <Panel key={question.ref} className="space-y-4 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[12px]" style={{ color: text(0.45) }}>
                Q{index + 1}
              </span>
              <span className="text-[12px]" style={{ color: text(0.45) }}>
                {question.marks} mark{question.marks === 1 ? "" : "s"}
              </span>
            </div>

            <TutorMessage body={question.stem} />

            {question.options && (
              <div className="space-y-2">
                {question.options.map((option) => {
                  const picked = chosen.includes(option.key);

                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() =>
                        setAnswers((current) => ({
                          ...current,
                          [question.ref]:
                            question.qtype === "msq"
                              ? picked
                                ? chosen.filter((key) => key !== option.key)
                                : [...chosen, option.key]
                              : [option.key],
                        }))
                      }
                      aria-pressed={picked}
                      className="flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left"
                      style={{
                        border: `1px solid ${picked ? acc(0.6) : text(0.12)}`,
                        background: picked ? acc(0.08) : "transparent",
                      }}
                    >
                      <span className="font-mono text-[13px]" style={{ color: text(0.5) }}>
                        {option.key}
                      </span>
                      <span className="text-[15px]" style={{ color: text(0.88) }}>
                        <Maths>{option.text}</Maths>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {question.qtype === "nvt" && (
              <input
                inputMode="decimal"
                value={typeof given === "string" ? given : ""}
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, [question.ref]: event.target.value }))
                }
                placeholder="Answer"
                className="w-full rounded-xl bg-transparent px-4 py-3 text-[15px]"
                style={{ border: `1px solid ${text(0.15)}`, color: text(0.9) }}
              />
            )}
          </Panel>
        );
      })}

      {error && (
        <p className="rounded-xl px-4 py-3 text-[14px]" style={{ background: acc(0.1), color: text(0.85) }}>
          {error}
        </p>
      )}

      <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-[13.5px]" style={{ color: text(0.6) }}>
          {answered} of {questions.length} answered
          {answered < questions.length && " — anything left blank scores zero"}
        </p>

        <Button type="button" disabled={submitting} onClick={() => void submit()}>
          {submitting ? "Submitting…" : "Submit"}
        </Button>
      </Panel>
    </div>
  );
}
