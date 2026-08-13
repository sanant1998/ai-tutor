"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";

import { Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { boardName, buildRoadmap, chosenSubjects } from "@/lib/study";
import { LEVELS, type LevelId } from "@/lib/mastery";
import { useAppData } from "@/lib/useAppData";
import { acc, acc2, onacc, text } from "@/lib/theme";

type Question = {
  id: string;
  prompt: string;
  marks: number;
  level: LevelId;
  kind: "short" | "long" | "mcq" | "calculation";
  options?: string[];
};

type Mark = {
  marksAwarded: number;
  maxMarks: number;
  verdict: "correct" | "partial" | "incorrect";
  feedback: string;
  markScheme: string[];
  modelAnswer: string;
};

const TYPES = [
  { value: "short", label: "Short Answer" },
  { value: "long", label: "Long Answer" },
  { value: "mcq", label: "Multiple Choice" },
  { value: "calculation", label: "Calculation" },
];

const DIFFICULTIES = [
  { value: "foundation", label: "Foundation" },
  { value: "standard", label: "Standard" },
  { value: "stretch", label: "Stretch" },
];

export function QuestionsView() {
  const { state, progress, updateProgress } = useAppData();

  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [type, setType] = useState("short");
  const [difficulty, setDifficulty] = useState("standard");

  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  /* Answers keyed by question id, so stepping back through the set shows what
     you actually wrote rather than an empty box. */
  const [answers, setAnswers] = useState<Record<string, string>>({});
  /* Marks keyed by question id, so going back to a marked question shows the
     mark again rather than a blank box. */
  const [marks, setMarks] = useState<Record<string, Mark>>({});

  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");

  const roadmap = useMemo(() => buildRoadmap(state), [state]);
  const subjects = chosenSubjects(state);
  const board = boardName(state);

  useEffect(() => {
    setSubjectId((current) => current || state.subjectIds[0] || "");
  }, [state.subjectIds]);

  const topics = useMemo(
    () => roadmap.filter((topic) => topic.subjectId === subjectId),
    [roadmap, subjectId],
  );

  useEffect(() => {
    if (!topics.some((topic) => topic.id === topicId)) {
      setTopicId(topics[0]?.id ?? "");
    }
  }, [topics, topicId]);

  const topic = topics.find((entry) => entry.id === topicId);
  const current = questions[index];
  const currentMark = current ? marks[current.id] : undefined;
  const answer = current ? (answers[current.id] ?? "") : "";
  const setAnswer = (value: string) => {
    if (current) setAnswers((all) => ({ ...all, [current.id]: value }));
  };

  const attempted = questions.filter((question) => marks[question.id]);
  const earned = attempted.reduce(
    (total, question) => total + marks[question.id].marksAwarded,
    0,
  );
  const available = attempted.reduce(
    (total, question) => total + marks[question.id].maxMarks,
    0,
  );

  const generate = async () => {
    if (!topic) return;

    setGenerating(true);
    setError("");

    try {
      const response = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId: state.boardId,
          classLevel: state.classLevel,
          subjectId: topic.subjectId,
          unitId: topic.unitId,
          topicId: topic.id,
          type,
          difficulty,
          count: 20,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Generation failed.");
        return;
      }

      setQuestions(payload.questions);
      setQuota(payload.quota ?? null);
      setIndex(0);
      setAnswers({});
      setMarks({});
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setGenerating(false);
    }
  };

  const markAnswer = async () => {
    if (!current) return;

    setMarking(true);
    setError("");

    try {
      const response = await fetch("/api/questions/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: current.id, answer }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Marking failed.");
        return;
      }

      setMarks((all) => ({ ...all, [current.id]: payload as Mark }));

      /* Feed the accuracy chart on the Progress page. Full marks counts as
         correct; anything less is a topic still worth revisiting. */
      updateProgress({
        ...progress,
        answers: [
          ...progress.answers,
          {
            date: new Date().toISOString().slice(0, 10),
            correct: payload.marksAwarded === payload.maxMarks,
          },
        ],
      });
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setMarking(false);
    }
  };

  const goTo = (next: number) => setIndex(next);

  return (
    <div>
      <p
        className="font-mono text-[11.5px] font-bold uppercase tracking-[0.16em]"
        style={{ color: acc() }}
      >
        ✦ Topic wise question set{board ? ` · ${board}` : ""}
      </p>

      <h1
        className="font-display mt-3 text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.4rem]"
        style={{ color: text() }}
      >
        Train like it&apos;s exam day.
      </h1>
      <p className="mt-2 max-w-2xl text-[15px]" style={{ color: text(0.6) }}>
        Twenty original questions per chapter, climbing from foundation to
        advanced. Every answer marked and classified.
      </p>

      <Panel className="mt-6 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            label="Topic"
            value={topicId}
            onChange={setTopicId}
            options={topics.map((entry) => ({
              value: entry.id,
              label: entry.name,
            }))}
            empty="No topics yet"
          />
          <Field
            label="Type"
            value={type}
            onChange={setType}
            options={TYPES}
            empty="—"
          />
          <Field
            label="Difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={DIFFICULTIES}
            empty="—"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Button disabled={!topic || generating} onClick={generate}>
            {generating ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin" />
            ) : (
              <Brain className="h-[18px] w-[18px]" />
            )}
            {generating ? "Writing your set…" : "Generate graded set of 20"}
          </Button>

          {questions.length > 0 && (
            <p className="font-mono text-[12px]" style={{ color: text(0.5) }}>
              {earned}/{available} marks · {attempted.length} of{" "}
              {questions.length} marked
            </p>
          )}

          {quota && (
            <p className="font-mono text-[12px]" style={{ color: text(0.4) }}>
              {Math.max(0, quota.limit - quota.used)} of {quota.limit} sets left
              today
            </p>
          )}
        </div>
      </Panel>

      {error && (
        <Panel className="mt-5 p-5">
          <p className="text-[14.5px]" style={{ color: text(0.85) }}>
            {error}
          </p>
        </Panel>
      )}

      {generating && questions.length === 0 && (
        <Panel className="mt-5 p-10 text-center">
          <Loader2
            className="mx-auto h-8 w-8 animate-spin"
            style={{ color: acc() }}
          />
          <p className="mt-4 text-[14.5px]" style={{ color: text(0.6) }}>
            Writing ten original {board} questions on {topic?.name}. This takes
            a few seconds.
          </p>
        </Panel>
      )}

      {!generating && questions.length === 0 && !error && (
        <Panel className="mt-5 p-10 text-center">
          <Brain className="mx-auto h-12 w-12" style={{ color: acc() }} />
          <p
            className="font-display mt-4 text-[1.3rem] font-extrabold tracking-[-0.02em]"
            style={{ color: text() }}
          >
            Ready when you are.
          </p>
          <p
            className="mx-auto mt-3 max-w-lg text-[14.5px] leading-[1.6]"
            style={{ color: text(0.6) }}
          >
            Pick a topic above and hit generate. We&apos;ll build a set of 10
            original questions in real {board || "exam"} style.
          </p>
        </Panel>
      )}

      {current && (
        <>
          <div className="mt-5 flex flex-wrap gap-1.5">
            {questions.map((question, position) => {
              const mark = marks[question.id];
              const active = position === index;

              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => goTo(position)}
                  aria-label={`Question ${position + 1}`}
                  aria-current={active}
                  className="h-8 w-8 rounded-lg font-mono text-[12px] font-bold transition-colors"
                  style={{
                    background: mark
                      ? mark.marksAwarded === mark.maxMarks
                        ? acc2(0.25)
                        : acc(0.2)
                      : text(0.05),
                    border: `1px solid ${active ? text(0.35) : "transparent"}`,
                    color: text(mark ? 0.9 : 0.5),
                  }}
                >
                  {position + 1}
                </button>
              );
            })}
          </div>

          <Panel className="mt-3 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <p
                className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ color: acc() }}
              >
                Question {index + 1} of {questions.length}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className="rounded-full px-2.5 py-1 font-mono text-[11px] font-bold"
                  style={{ background: acc(0.15), color: acc() }}
                  title={LEVELS.find((l) => l.id === current.level)?.brief}
                >
                  {current.level} ·{" "}
                  {LEVELS.find((l) => l.id === current.level)?.name}
                </span>
                <span
                  className="rounded-full px-2.5 py-1 font-mono text-[11px] font-bold"
                  style={{ background: text(0.06), color: text(0.6) }}
                >
                  {current.marks} {current.marks === 1 ? "mark" : "marks"}
                </span>
              </div>
            </div>

            <p
              className="mt-3 whitespace-pre-wrap text-[16px] font-bold leading-[1.55]"
              style={{ color: text() }}
            >
              {current.prompt}
            </p>

            {current.kind === "mcq" && current.options ? (
              <ul className="mt-4 space-y-2">
                {current.options.map((option, position) => {
                  const letter = String.fromCharCode(65 + position);
                  const chosen = answer === letter;

                  return (
                    <li key={option}>
                      <button
                        type="button"
                        disabled={Boolean(currentMark)}
                        onClick={() => setAnswer(letter)}
                        className="flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left transition-colors disabled:cursor-default"
                        style={{
                          background: chosen ? acc(0.12) : text(0.035),
                          border: `1px solid ${chosen ? acc(0.4) : text(0.08)}`,
                        }}
                      >
                        <span
                          className="font-mono text-[12.5px] font-bold"
                          style={{ color: acc() }}
                        >
                          {letter}
                        </span>
                        <span className="text-[14.5px]" style={{ color: text(0.85) }}>
                          {option}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <textarea
                rows={current.kind === "long" ? 9 : 5}
                value={answer}
                disabled={Boolean(currentMark)}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Write your answer as you would in the exam — show your working."
                aria-label="Your answer"
                className="mt-4 w-full rounded-xl p-4 text-[15px] leading-[1.6] outline-none disabled:opacity-70"
                style={{
                  background: text(0.04),
                  border: `1px solid ${text(0.12)}`,
                  color: text(0.9),
                }}
              />
            )}

            {!currentMark && (
              <Button className="mt-4" disabled={marking} onClick={markAnswer}>
                {marking ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin" />
                ) : (
                  <Check className="h-[18px] w-[18px]" />
                )}
                {marking ? "Marking…" : "Mark my answer"}
              </Button>
            )}

            {currentMark && <MarkPanel mark={currentMark} />}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                variant="glass"
                size="sm"
                disabled={index === 0}
                onClick={() => goTo(index - 1)}
              >
                Previous
              </Button>
              <Button
                variant="glass"
                size="sm"
                disabled={index === questions.length - 1}
                onClick={() => goTo(index + 1)}
              >
                Next question
              </Button>
              <Button
                variant="glass"
                size="sm"
                onClick={() => {
                  setQuestions([]);
                  setMarks({});
                  setAnswers({});
                  setIndex(0);
                }}
              >
                <RotateCcw className="h-4 w-4" />
                New set
              </Button>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function MarkPanel({ mark }: { mark: Mark }) {
  const [openScheme, setOpenScheme] = useState(false);
  const full = mark.marksAwarded === mark.maxMarks;
  const zero = mark.marksAwarded === 0;

  return (
    <div
      className="mt-4 rounded-2xl p-5"
      style={{
        background: full ? acc2(0.1) : zero ? text(0.04) : acc(0.09),
        border: `1px solid ${full ? acc2(0.3) : zero ? text(0.1) : acc(0.25)}`,
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{
            background: full ? acc2() : zero ? text(0.15) : acc(),
            color: onacc(),
          }}
        >
          {zero ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        </span>
        <p
          className="font-display text-[1.15rem] font-extrabold tracking-[-0.015em]"
          style={{ color: text() }}
        >
          {mark.marksAwarded} / {mark.maxMarks}
        </p>
        <span
          className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
          style={{ color: text(0.5) }}
        >
          {mark.verdict}
        </span>
      </div>

      <p
        className="mt-3 text-[14.5px] leading-[1.65]"
        style={{ color: text(0.8) }}
      >
        {mark.feedback}
      </p>

      <button
        type="button"
        aria-expanded={openScheme}
        onClick={() => setOpenScheme((value) => !value)}
        className="mt-4 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
        style={{ color: acc() }}
      >
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform"
          style={{ transform: openScheme ? "rotate(180deg)" : undefined }}
        />
        Mark scheme and model answer
      </button>

      {openScheme && (
        <div className="mt-3">
          <ul className="space-y-1.5">
            {mark.markScheme.map((point, position) => (
              <li
                key={position}
                className="flex gap-2 text-[14px] leading-[1.55]"
                style={{ color: text(0.75) }}
              >
                <span className="font-mono text-[12px]" style={{ color: acc() }}>
                  ✓
                </span>
                {point}
              </li>
            ))}
          </ul>

          <p
            className="mt-4 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em]"
            style={{ color: text(0.45) }}
          >
            Model answer
          </p>
          <p
            className="mt-2 whitespace-pre-wrap text-[14px] leading-[1.65]"
            style={{ color: text(0.8) }}
          >
            {mark.modelAnswer}
          </p>
        </div>
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
