"use client";

/* The fix sheet, printed.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCREEN IS BUILT TO BE PRINTED
 *
 * Indian parents print things and stick them on a wall. That is not a quaint
 * observation — it is the difference between a diagnosis a student reads once
 * on a phone and one they see every morning for a fortnight. So the layout is
 * plain, the print stylesheet drops the app furniture, and the drill questions
 * come without answers so the sheet works away from the screen.
 *
 * ---------------------------------------------------------------------------
 * NO MODEL CALL
 *
 * Every line here already exists: the misconception was written when the
 * concept was authored, and the error_event records which one produced which
 * wrong answer. Asking a model to paraphrase a correction we already have
 * would cost money, add a spinner, and change the wording every week — for a
 * document whose whole value is being the same thing on the wall each day.
 *
 * The one number worth watching is `diagnosedFrom`. Where it says "model" the
 * diagnosis came from marking prose rather than from a distractor map, and a
 * sheet full of those means the content is too thin. */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";

import { Panel } from "@/components/app/ui";
/* Maths, not TutorMessage, almost everywhere on this screen: the fix sheet
   is dense inline prose inside <p> elements, and TutorMessage renders blocks.
   A <div> inside a <p> is invalid HTML and surfaces as a hydration mismatch. */
import { Maths } from "@/components/app/Maths";
import { Button } from "@/components/ui/button";
import { acc, text } from "@/lib/theme";

type Entry = {
  concept: string;
  topic: string;
  times: number;
  lastSeen: string;
  error: { type: string; name: string; fix: string };
  remedy: { belief: string; whyWrong: string; correction: string } | null;
  formula: { latex: string; note?: string } | null;
  drill: { id: string; stem: string; level: string; options: { key: string; text: string }[] | null }[];
  diagnosedFrom: "distractor_map" | "model";
};

export function TutorFixSheet({ topicId }: { topicId?: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(
        `/api/tutor/fix-sheet${topicId ? `?topicId=${encodeURIComponent(topicId)}` : ""}`,
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "The fix sheet could not be built.");
        return;
      }

      setEntries(payload.entries ?? []);
      setNote(payload.note ?? "");
    } catch {
      setError("Network problem.");
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16" style={{ color: text(0.5) }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-[14px]">Looking at your mistakes…</span>
      </div>
    );
  }

  if (error) {
    return (
      <Panel className="p-6">
        <p style={{ color: text(0.7) }}>{error}</p>
      </Panel>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Dropped when printing — a sheet on a wall does not need a button. */}
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <p
            className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ color: text(0.45) }}
          >
            Fix sheet
          </p>
          <h1
            className="font-display mt-2 text-[2rem] font-extrabold tracking-[-0.035em]"
            style={{ color: text() }}
          >
            The mistakes that keep coming back
          </h1>
          <p className="mt-2 max-w-xl text-[15px]" style={{ color: text(0.6) }}>
            The last 30 days of mistakes, most repeated first. Each one with the line
            worth remembering, and three fresh questions.
          </p>
        </div>

        <Button type="button" onClick={() => window.print()} className="px-4">
          <Printer className="mr-1.5 h-4 w-4" />
          Print
        </Button>
      </header>

      {entries.length === 0 ? (
        <Panel className="p-6">
          <p className="text-[15px]" style={{ color: text(0.7) }}>
            {note || "No mistakes recorded yet."}
          </p>
        </Panel>
      ) : (
        <div className="space-y-4">
          {entries.map((entry, index) => (
            <Panel key={index} className="space-y-3 p-5 print:border print:border-black/20">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[16px] font-bold" style={{ color: text(0.92) }}>
                  {index + 1}. {entry.concept}
                </h2>
                <span className="text-[13px]" style={{ color: text(0.5) }}>
                  {entry.times} baar · {entry.error.name}
                </span>
              </div>

              {entry.remedy ? (
                <>
                  <p className="text-[14px]" style={{ color: text(0.7) }}>
                    <span className="font-semibold">Wrong belief:</span>{" "}
                    <Maths>{entry.remedy.belief}</Maths>
                  </p>

                  <p className="text-[14px]" style={{ color: text(0.7) }}>
                    <Maths>{entry.remedy.whyWrong}</Maths>
                  </p>

                  <p
                    className="rounded-xl px-4 py-3 text-[15px] font-semibold"
                    style={{ background: acc(0.1), color: text(0.9) }}
                  >
                    <Maths>{entry.remedy.correction}</Maths>
                  </p>
                </>
              ) : (
                /* No misconception behind it. Said plainly rather than filled
                   with a generic paragraph — a fix sheet that invents a
                   diagnosis is worse than one that admits it has none. */
                <p className="text-[14px]" style={{ color: text(0.7) }}>
                  {entry.error.fix}
                </p>
              )}

              {entry.formula && (
                <p className="text-[15px]" style={{ color: text(0.85) }}>
                  <Maths>{`$${entry.formula.latex}$`}</Maths>
                  {entry.formula.note && (
                    <span className="ml-2 text-[13px]" style={{ color: text(0.55) }}>
                      {entry.formula.note}
                    </span>
                  )}
                </p>
              )}

              {entry.drill.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p
                    className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: text(0.45) }}
                  >
                    Do this now
                  </p>

                  {entry.drill.map((question, questionIndex) => (
                    <div key={question.id} className="text-[14px]" style={{ color: text(0.8) }}>
                      <span style={{ color: text(0.45) }}>{questionIndex + 1}.</span>{" "}
                      <Maths>{question.stem}</Maths>

                      {question.options && (
                        <div className="ml-4 mt-0.5 space-y-0.5">
                          {question.options.map((option) => (
                            <p key={option.key} className="text-[13px]" style={{ color: text(0.68) }}>
                              <span style={{ color: text(0.45) }}>{option.key}.</span>{" "}
                              <Maths>{option.text}</Maths>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Deliberately no answers. This sheet is meant to be worked
                      on paper; an answer key on the same page defeats it. */}
                  <p className="text-[12px]" style={{ color: text(0.42) }}>
                    Check your answers in the app — they are left out here on purpose.
                  </p>
                </div>
              )}

              {entry.diagnosedFrom === "model" && (
                <p className="text-[11px] print:hidden" style={{ color: text(0.38) }}>
                  This diagnosis came from a written answer rather than a fixed
                  wrong option — so it is a little less certain.
                </p>
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
