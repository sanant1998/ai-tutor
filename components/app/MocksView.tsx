"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileClock, Info, Loader2, Plus, Send, Timer } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { unitsFor } from "@/lib/onboarding";
import { boardName, chosenSubjects, chosenUnits } from "@/lib/study";
import { useAppData } from "@/lib/useAppData";
import { acc, acc2, text } from "@/lib/theme";

type Question = { id: string; prompt: string; marks: number; topic: string };

type Paper = {
  title: string;
  scope: string;
  minutes: number;
  totalMarks: number;
  questions: Question[];
};

type Result = {
  results: {
    questionId: string;
    marksAwarded: number;
    maxMarks: number;
    comment: string;
  }[];
  overall: string;
  earned: number;
  total: number;
  percent: number;
};

const DURATIONS = [30, 60, 90];

export function MocksView() {
  const { state, progress, updateProgress } = useAppData();

  const [subjectId, setSubjectId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [minutes, setMinutes] = useState(60);

  const [paper, setPaper] = useState<Paper | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");

  const board = boardName(state);
  const styleName = board.split(" ")[0] || "exam board";
  const subjects = chosenSubjects(state);

  const units = useMemo(
    () => (subjectId ? chosenUnits(state, subjectId) : []),
    [state, subjectId],
  );

  useEffect(() => {
    setSubjectId((current) => current || state.subjectIds[0] || "");
  }, [state.subjectIds]);

  useEffect(() => {
    if (!units.some((unit) => unit.id === unitId)) {
      setUnitId(units[0]?.id ?? "");
    }
  }, [units, unitId]);

  /* The timer is advisory: it counts down while the paper is open and stops
     at zero rather than submitting, because losing written answers to a
     clock would be worse than an overrun mock. */
  const running = Boolean(paper) && !result && secondsLeft > 0;
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    tick.current = setInterval(() => {
      setSecondsLeft((value) => Math.max(0, value - 1));
    }, 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [running]);

  const generate = async () => {
    if (!subjectId || !unitId) return;

    setGenerating(true);
    setError("");

    try {
      const response = await fetch("/api/mocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId: state.boardId,
          classLevel: state.classLevel,
          subjectId,
          unitId,
          minutes,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Generation failed.");
        return;
      }

      setPaper(payload as Paper);
      setQuota(payload.quota ?? null);
      setAnswers({});
      setResult(null);
      setSecondsLeft(payload.minutes * 60);
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setGenerating(false);
    }
  };

  const submit = async () => {
    if (!paper) return;

    setMarking(true);
    setError("");

    try {
      const response = await fetch("/api/mocks/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: paper.questions.map((question) => ({
            questionId: question.id,
            answer: answers[question.id] ?? "",
          })),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Marking failed.");
        return;
      }

      setResult(payload as Result);

      /* Mock average on the Progress page comes straight from here. */
      updateProgress({
        ...progress,
        mockScores: [
          ...progress.mockScores,
          {
            date: new Date().toISOString().slice(0, 10),
            percent: payload.percent,
          },
        ],
      });
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setMarking(false);
    }
  };

  const clock = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(
    secondsLeft % 60,
  ).padStart(2, "0")}`;

  const unitName =
    unitsFor(state.boardId, state.classLevel, subjectId).find((unit) => unit.id === unitId)?.name ??
    "";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p
            className="font-mono text-[11.5px] font-bold uppercase tracking-[0.16em]"
            style={{ color: acc() }}
          >
            ◎ Mock paper engine
          </p>
          <h1
            className="font-display mt-3 text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.4rem]"
            style={{ color: text() }}
          >
            Sit a real {styleName}-style mock.
          </h1>
          <p className="mt-2 text-[15px]" style={{ color: text(0.6) }}>
            Original questions. Real timing. Examiner-grade marking.
          </p>
        </div>

        {paper && !result && (
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-2.5"
            style={{
              background: secondsLeft === 0 ? text(0.06) : acc(0.12),
              border: `1px solid ${secondsLeft === 0 ? text(0.12) : acc(0.3)}`,
            }}
          >
            <Timer className="h-4 w-4" style={{ color: acc() }} />
            <span
              className="font-mono text-[16px] font-bold tabular-nums"
              style={{ color: text() }}
            >
              {clock}
            </span>
          </div>
        )}
      </div>

      <Panel className="mt-6 flex items-start gap-3 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: acc() }} />
        <p className="text-[13.5px] leading-[1.55]" style={{ color: text(0.6) }}>
          AI marking is most reliable for calculation and short-answer
          questions. Extended response marking is indicative — use it as
          guidance, not a definitive grade.
        </p>
      </Panel>

      {error && (
        <Panel className="mt-5 p-5">
          <p className="text-[14.5px]" style={{ color: text(0.85) }}>
            {error}
          </p>
        </Panel>
      )}

      {!paper && (
        <Panel className="mt-5 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Subject"
              value={subjectId}
              onChange={setSubjectId}
              options={subjects.map((subject) => ({
                value: subject.id,
                label: `${subject.glyph} ${subject.name}`,
              }))}
              empty="No subjects yet"
            />
            <Field
              label="Unit"
              value={unitId}
              onChange={setUnitId}
              options={units.map((unit) => ({
                value: unit.id,
                label: `${unit.code} · ${unit.name}`,
              }))}
              empty="No units yet"
            />
            <Field
              label="Duration"
              value={String(minutes)}
              onChange={(value) => setMinutes(Number(value))}
              options={DURATIONS.map((value) => ({
                value: String(value),
                label: `${value} minutes`,
              }))}
              empty="—"
            />
          </div>

          <Button
            className="mt-5"
            disabled={!subjectId || !unitId || generating}
            onClick={generate}
          >
            {generating ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin" />
            ) : (
              <Plus className="h-[18px] w-[18px]" />
            )}
            {generating ? "Setting your paper…" : "Build mock paper"}
          </Button>

          {quota && (
            <p className="mt-3 font-mono text-[12px]" style={{ color: text(0.4) }}>
              {Math.max(0, quota.limit - quota.used)} of {quota.limit} papers
              left today
            </p>
          )}

          {!generating && (
            <div className="mt-8 text-center">
              <FileClock className="mx-auto h-12 w-12" style={{ color: acc() }} />
              <p
                className="font-display mt-4 text-[1.3rem] font-extrabold tracking-[-0.02em]"
                style={{ color: text() }}
              >
                {progress.mockScores.length === 0
                  ? "No mocks yet. Set your baseline."
                  : `${progress.mockScores.length} sat so far.`}
              </p>
              <p className="mt-2 text-[14.5px]" style={{ color: text(0.6) }}>
                Real exam conditions. Real {styleName} style.
                {unitName ? ` Starting with ${unitName}.` : ""}
              </p>
            </div>
          )}

          {generating && (
            <p
              className="mt-6 text-center text-[14.5px]"
              style={{ color: text(0.6) }}
            >
              Writing a {minutes}-minute paper on {unitName}. This takes up to a
              minute.
            </p>
          )}
        </Panel>
      )}

      {paper && (
        <>
          <Panel className="mt-5 p-5 sm:p-6">
            <p
              className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
              style={{ color: acc() }}
            >
              {paper.scope}
            </p>
            <h2
              className="font-display mt-2 text-[1.4rem] font-extrabold tracking-[-0.02em]"
              style={{ color: text() }}
            >
              {paper.title}
            </h2>
            <p className="mt-1 font-mono text-[12px]" style={{ color: text(0.5) }}>
              {paper.minutes} minutes · {paper.totalMarks} marks ·{" "}
              {paper.questions.length} questions
            </p>
          </Panel>

          {result && (
            <Panel className="mt-5 p-6">
              <p
                className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ color: acc() }}
              >
                Result
              </p>
              <p
                className="font-display mt-2 text-[2.4rem] font-extrabold leading-none tracking-[-0.03em]"
                style={{ color: text() }}
              >
                {result.percent}%
              </p>
              <p className="mt-1 text-[14.5px]" style={{ color: text(0.6) }}>
                {result.earned} of {result.total} marks
              </p>
              <p
                className="mt-4 text-[14.5px] leading-[1.7]"
                style={{ color: text(0.85) }}
              >
                {result.overall}
              </p>
            </Panel>
          )}

          <ol className="mt-5 space-y-4">
            {paper.questions.map((question, index) => {
              const marked = result?.results.find(
                (entry) => entry.questionId === question.id,
              );

              return (
                <li key={question.id}>
                  <Panel className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <p
                        className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
                        style={{ color: acc() }}
                      >
                        {index + 1}. {question.topic}
                      </p>
                      <span
                        className="shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold"
                        style={{ background: text(0.06), color: text(0.6) }}
                      >
                        {marked
                          ? `${marked.marksAwarded}/${marked.maxMarks}`
                          : `${question.marks} ${question.marks === 1 ? "mark" : "marks"}`}
                      </span>
                    </div>

                    <p
                      className="mt-3 whitespace-pre-wrap text-[15.5px] font-bold leading-[1.55]"
                      style={{ color: text() }}
                    >
                      {question.prompt}
                    </p>

                    <textarea
                      rows={question.marks > 4 ? 8 : 4}
                      value={answers[question.id] ?? ""}
                      disabled={Boolean(result)}
                      onChange={(event) =>
                        setAnswers((all) => ({
                          ...all,
                          [question.id]: event.target.value,
                        }))
                      }
                      placeholder="Your answer — show your working."
                      aria-label={`Answer to question ${index + 1}`}
                      className="mt-3 w-full rounded-xl p-4 text-[15px] leading-[1.6] outline-none disabled:opacity-70"
                      style={{
                        background: text(0.04),
                        border: `1px solid ${text(0.12)}`,
                        color: text(0.9),
                      }}
                    />

                    {marked && (
                      <p
                        className="mt-3 rounded-xl p-4 text-[14px] leading-[1.65]"
                        style={{
                          background:
                            marked.marksAwarded === marked.maxMarks
                              ? acc2(0.1)
                              : acc(0.08),
                          border: `1px solid ${
                            marked.marksAwarded === marked.maxMarks
                              ? acc2(0.28)
                              : acc(0.22)
                          }`,
                          color: text(0.8),
                        }}
                      >
                        {marked.comment}
                      </p>
                    )}
                  </Panel>
                </li>
              );
            })}
          </ol>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {!result && (
              <Button disabled={marking} onClick={submit}>
                {marking ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin" />
                ) : (
                  <Send className="h-[18px] w-[18px]" />
                )}
                {marking ? "Marking your paper…" : "Submit for marking"}
              </Button>
            )}

            <Button
              variant="glass"
              onClick={() => {
                setPaper(null);
                setResult(null);
                setAnswers({});
                setSecondsLeft(0);
              }}
            >
              {result ? "Sit another paper" : "Abandon paper"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  options,
  empty,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  empty: string;
}) {
  return (
    <div>
      <label
        className="block font-mono text-[10.5px] font-bold uppercase tracking-[0.16em]"
        style={{ color: text(0.45) }}
      >
        {label}
      </label>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full cursor-pointer rounded-xl px-3 text-[14.5px] outline-none"
        style={{
          background: text(0.04),
          border: `1px solid ${text(0.12)}`,
          color: text(0.9),
        }}
      >
        {options.length === 0 && <option value="">{empty}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} style={{ color: "#111" }}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
