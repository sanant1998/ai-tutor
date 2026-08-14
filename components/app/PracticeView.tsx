"use client";

/* Practice, which is where the distractor map earns its keep.
 *
 * ---------------------------------------------------------------------------
 * THE FEEDBACK IS THE PRODUCT
 *
 * Every practice app in this market shows a red cross and the correct answer.
 * That teaches almost nothing: a student who picked B because they were
 * thinking of the reciprocal learns that B was wrong, not that they confused
 * two different inverses — and they will pick the same option next week.
 *
 * Here a wrong option comes back with the belief that produces it, why it is
 * wrong, and the one line worth remembering. All of it was written by a human
 * when the question was written, so it costs nothing, arrives instantly and is
 * right every time.
 *
 * ---------------------------------------------------------------------------
 * THE ANSWER IS NOT IN THE PAGE
 *
 * The question arrives without `correct`, without `solution` and without the
 * distractor map. Marking is a POST, and the solution comes back in that
 * response — after the attempt has been recorded. That ordering is what stops
 * "fetch, peek, answer" from working, and it is worth keeping in mind before
 * adding any prefetch to this screen. */

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Loader2, X } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { Paywall } from "@/components/app/Paywall";
import { Maths, TutorMessage } from "@/components/app/Maths";
import { Button } from "@/components/ui/button";
import { acc, text } from "@/lib/theme";

type Question = {
  id: string;
  qtype: "mcq" | "msq" | "nvt" | "subjective";
  level: string;
  stem: string;
  options: { key: string; text: string }[] | null;
  marks: number;
  conceptId: string | null;
};

type Marked = {
  correct: boolean;
  feedback: string;
  solution: string;
  error: {
    type: string;
    source: string;
    misconception: {
      id: string;
      belief: string;
      whyWrong: string;
      correction: string;
    } | null;
  } | null;
  mastery: { score: number; band: string; nextReview: string | null } | null;
};

const LEVEL_LABEL: Record<string, string> = {
  L1: "Foundation",
  L2: "Core",
  L3: "Applied",
  L4: "Advanced",
};

export function PracticeView({ topicId }: { topicId: string }) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [repeat, setRepeat] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [marked, setMarked] = useState<Marked | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");
  const [paywalled, setPaywalled] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [streak, setStreak] = useState(0);

  const next = useCallback(async () => {
    setLoading(true);
    setMarked(null);
    setChosen([]);
    setTyped("");
    setError("");

    try {
      const response = await fetch(`/api/tutor/practice/next?topicId=${encodeURIComponent(topicId)}`);
      const payload = await response.json();

      if (response.status === 402) {
        setPaywalled(true);
        return;
      }

      if (!response.ok) {
        setError(payload.error ?? "The question did not load.");
        return;
      }

      setQuestion(payload.question);
      setRepeat(Boolean(payload.repeat));
      setStartedAt(Date.now());
    } catch {
      setError("Network problem.");
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    void next();
  }, [next]);

  const submit = async () => {
    if (!question || marking) return;

    const answer =
      question.qtype === "mcq" || question.qtype === "msq" ? chosen : typed.trim();

    if ((Array.isArray(answer) && answer.length === 0) || (!Array.isArray(answer) && !answer)) {
      return;
    }

    setMarking(true);

    try {
      const response = await fetch("/api/tutor/practice/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          answer,
          timeTakenMs: Date.now() - startedAt,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "That could not be marked.");
        return;
      }

      setMarked(payload);
      setStreak((current) => (payload.correct ? current + 1 : 0));
    } catch {
      setError("Network problem.");
    } finally {
      setMarking(false);
    }
  };

  if (paywalled) return <Paywall onUnlocked={() => window.location.reload()} />;

  if (loading && !question) {
    return (
      <div className="flex items-center gap-2 py-16" style={{ color: text(0.5) }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-[14px]">Loading the next question…</span>
      </div>
    );
  }

  if (error && !question) {
    return (
      <Panel className="p-6">
        <p style={{ color: text(0.7) }}>{error}</p>
      </Panel>
    );
  }

  if (!question) return null;

  const answered = marked !== null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <span
          className="rounded-full px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
          style={{ background: acc(0.14), color: acc() }}
        >
          {LEVEL_LABEL[question.level] ?? question.level}
        </span>

        {streak >= 2 && (
          <span className="text-[13px]" style={{ color: text(0.55) }}>
            {streak} correct in a row
          </span>
        )}
      </div>

      {repeat && (
        <p className="text-[13px]" style={{ color: text(0.5) }}>
          You have seen this question before — there are no new ones left at this
          level. Doing it again is still practice.
        </p>
      )}

      <Panel className="space-y-4 p-5">
        <TutorMessage body={question.stem} />

        {question.options && (
          <div className="space-y-2">
            {question.options.map((option) => {
              const picked = chosen.includes(option.key);

              return (
                <button
                  key={option.key}
                  type="button"
                  disabled={answered}
                  onClick={() =>
                    setChosen((current) =>
                      question.qtype === "msq"
                        ? current.includes(option.key)
                          ? current.filter((key) => key !== option.key)
                          : [...current, option.key]
                        : [option.key],
                    )
                  }
                  aria-pressed={picked}
                  className="flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left transition-opacity disabled:opacity-70"
                  style={{
                    border: `1px solid ${picked ? acc(0.6) : text(0.12)}`,
                    background: picked ? acc(0.08) : "transparent",
                  }}
                >
                  <span className="font-mono text-[13px]" style={{ color: text(0.5) }}>
                    {option.key}
                  </span>
                  <span className="text-[15px]" style={{ color: text(0.88) }}>
                    {/* Maths, not TutorMessage: this sits inside a <span>, and
                        TutorMessage renders block <p> elements. Nesting a block
                        inside inline content is invalid HTML and shows up as a
                        hydration mismatch rather than as anything visible. */}
                    <Maths>{option.text}</Maths>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {question.qtype === "nvt" && (
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={answered}
            inputMode="text"
            aria-label="Answer — fraction or decimal"
            placeholder="Write your answer — a fraction (2/3) or a decimal, either works"
            className="w-full rounded-xl px-4 py-3 text-[15px] outline-none"
            style={{ background: text(0.04), border: `1px solid ${text(0.1)}`, color: text(0.9) }}
          />
        )}

        {question.qtype === "subjective" && (
          <textarea
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={answered}
            rows={5}
            aria-label="Write your answer"
            placeholder="In your own words. Showing your steps is better."
            className="w-full rounded-xl px-4 py-3 text-[15px] outline-none"
            style={{ background: text(0.04), border: `1px solid ${text(0.1)}`, color: text(0.9) }}
          />
        )}
      </Panel>

      {/* --- Feedback ------------------------------------------------------
          The part that makes practice worth doing. A wrong answer that matched
          a known misconception says which belief produced it; one that matched
          nothing says so plainly rather than inventing a diagnosis. */}
      {marked && (
        <Panel className="space-y-3 p-5" role="status" aria-live="polite">
          <p
            className="flex items-center gap-2 text-[15px] font-semibold"
            style={{ color: marked.correct ? "#16a34a" : text(0.85) }}
          >
            {marked.correct ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <X className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="sr-only">{marked.correct ? "Correct. " : "Incorrect. "}</span>
            {marked.feedback}
          </p>

          {marked.error?.misconception && (
            <div className="space-y-1.5 rounded-xl p-4" style={{ background: acc(0.09) }}>
              <p className="text-[13px] font-semibold" style={{ color: text(0.8) }}>
                Why this mistake happens
              </p>
              <p className="text-[14px]" style={{ color: text(0.75) }}>
                <Maths>{marked.error.misconception.whyWrong}</Maths>
              </p>
              <p className="text-[14px] font-semibold" style={{ color: text(0.9) }}>
                <Maths>{marked.error.misconception.correction}</Maths>
              </p>
            </div>
          )}

          <details>
            <summary className="cursor-pointer text-[13px]" style={{ color: text(0.55) }}>
              See the full solution
            </summary>
            <div className="mt-2">
              <TutorMessage body={marked.solution} />
            </div>
          </details>

          {marked.mastery && (
            <p className="text-[12px]" style={{ color: text(0.45) }}>
              {Math.round(marked.mastery.score)}/100 on this topic · {marked.mastery.band}
              {marked.mastery.nextReview
                ? ` · next revision ${marked.mastery.nextReview}`
                : ""}
            </p>
          )}
        </Panel>
      )}

      {error && (
        <p className="text-[13px]" role="alert" style={{ color: text(0.6) }}>
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {!answered ? (
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={
              marking ||
              (question.options ? chosen.length === 0 : typed.trim().length === 0)
            }
            className="px-5"
          >
            {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
          </Button>
        ) : (
          <Button type="button" onClick={() => void next()} className="px-5">
            Next question
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
