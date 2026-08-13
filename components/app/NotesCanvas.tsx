"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw, Sparkles } from "lucide-react";

import { TopicExplainer } from "@/components/app/TopicExplainer";
import { Kicker, Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import type { Topic } from "@/lib/study";
import { acc, acc2, text } from "@/lib/theme";

type Notes = {
  summary: string;
  sections: { heading: string; points: string[] }[];
  formulae?: { expression: string; meaning: string }[];
  workedExample: { question: string; steps: string[]; answer: string };
  examinerTips: string[];
};

/* The right-hand pane of the notes page: one topic, generated on demand.
   Keyed by topic in the parent, so switching topics resets it. */
export function NotesCanvas({
  topic,
  boardId,
  classLevel,
}: {
  topic: Topic;
  boardId: string | null;
  classLevel: number | null;
}) {
  const [notes, setNotes] = useState<Notes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* A new topic means the previous notes are no longer about anything on
     screen — clear them rather than leave the wrong topic showing. */
  useEffect(() => {
    setNotes(null);
    setError("");
  }, [topic.id]);

  const generate = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId,
          classLevel,
          subjectId: topic.subjectId,
          unitId: topic.unitId,
          topicId: topic.id,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Generation failed.");
        return;
      }

      setNotes(payload.notes as Notes);
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Panel className="mt-5 p-6 sm:p-7">
      <Kicker>
        {topic.subjectName} · {topic.unitCode}
      </Kicker>
      <h2
        className="font-display mt-3 text-[1.6rem] font-extrabold tracking-[-0.025em]"
        style={{ color: text() }}
      >
        {topic.name}
      </h2>

      {error && (
        <div
          className="mt-5 flex items-start gap-3 rounded-xl p-4"
          style={{ background: text(0.04), border: `1px solid ${text(0.1)}` }}
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: acc() }}
          />
          <p className="text-[14px] leading-[1.6]" style={{ color: text(0.8) }}>
            {error}
          </p>
        </div>
      )}

      {!notes && !loading && (
        <Button className="mt-6" onClick={generate}>
          <Sparkles className="h-[18px] w-[18px]" />
          {error ? "Try again" : "Generate notes"}
        </Button>
      )}

      {loading && (
        <div className="mt-8 flex flex-col items-center py-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: acc() }} />
          <p className="mt-4 text-[14.5px]" style={{ color: text(0.6) }}>
            Writing notes for {topic.name}…
          </p>
        </div>
      )}

      {notes && (
        <article className="mt-6">
          <p
            className="text-[15.5px] leading-[1.7]"
            style={{ color: text(0.85) }}
          >
            {notes.summary}
          </p>

          {notes.sections.map((section) => (
            <section key={section.heading} className="mt-7">
              <h3
                className="font-mono text-[12px] font-bold uppercase tracking-[0.14em]"
                style={{ color: acc() }}
              >
                {section.heading}
              </h3>
              <ul className="mt-3 space-y-2">
                {section.points.map((point, index) => (
                  <li
                    key={index}
                    className="flex gap-3 text-[14.5px] leading-[1.65]"
                    style={{ color: text(0.8) }}
                  >
                    <span aria-hidden="true" style={{ color: acc(0.6) }}>
                      —
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {notes.formulae && notes.formulae.length > 0 && (
            <section className="mt-7">
              <h3
                className="font-mono text-[12px] font-bold uppercase tracking-[0.14em]"
                style={{ color: acc() }}
              >
                Formulae
              </h3>
              <ul className="mt-3 space-y-2">
                {notes.formulae.map((entry) => (
                  <li
                    key={entry.expression}
                    className="rounded-xl px-4 py-3"
                    style={{
                      background: text(0.035),
                      border: `1px solid ${text(0.08)}`,
                    }}
                  >
                    <p
                      className="font-mono text-[15px] font-bold"
                      style={{ color: text() }}
                    >
                      {entry.expression}
                    </p>
                    <p
                      className="mt-1 text-[13.5px] leading-[1.55]"
                      style={{ color: text(0.6) }}
                    >
                      {entry.meaning}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section
            className="mt-7 rounded-2xl p-5"
            style={{ background: acc(0.07), border: `1px solid ${acc(0.2)}` }}
          >
            <h3
              className="font-mono text-[12px] font-bold uppercase tracking-[0.14em]"
              style={{ color: acc() }}
            >
              Worked example
            </h3>
            <p
              className="mt-3 text-[15px] font-bold leading-[1.55]"
              style={{ color: text() }}
            >
              {notes.workedExample.question}
            </p>
            <ol className="mt-3 space-y-2">
              {notes.workedExample.steps.map((step, index) => (
                <li
                  key={index}
                  className="flex gap-3 text-[14.5px] leading-[1.65]"
                  style={{ color: text(0.8) }}
                >
                  <span
                    className="font-mono text-[12.5px] font-bold"
                    style={{ color: acc() }}
                  >
                    {index + 1}.
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <p
              className="mt-4 text-[14.5px] font-bold"
              style={{ color: acc2() }}
            >
              {notes.workedExample.answer}
            </p>
          </section>

          <section className="mt-7">
            <h3
              className="font-mono text-[12px] font-bold uppercase tracking-[0.14em]"
              style={{ color: acc() }}
            >
              Where marks are lost
            </h3>
            <ul className="mt-3 space-y-2">
              {notes.examinerTips.map((tip, index) => (
                <li
                  key={index}
                  className="flex gap-3 text-[14.5px] leading-[1.65]"
                  style={{ color: text(0.8) }}
                >
                  <AlertTriangle
                    className="mt-1 h-3.5 w-3.5 shrink-0"
                    style={{ color: acc() }}
                  />
                  {tip}
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button variant="glass" size="sm" onClick={generate}>
              <RotateCcw className="h-4 w-4" />
              Regenerate
            </Button>
            <Button variant="glass" size="sm" onClick={() => window.print()}>
              Print or save as PDF
            </Button>
          </div>

          <p className="mt-4 text-[12.5px] italic" style={{ color: text(0.45) }}>
            AI-written notes. Check anything that contradicts your textbook or
            teacher before you rely on it in the exam.
          </p>
        </article>
      )}
    </Panel>

    <TopicExplainer topic={topic} boardId={boardId} classLevel={classLevel} />
    </>
  );
}
