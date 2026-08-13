"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, FileText, Layers, Loader2, Search } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { EXAM_BOARDS, SUBJECTS } from "@/lib/onboarding";
import { EXAM_FAQ_GROUPS, TOTAL_FAQ_QUESTIONS } from "@/lib/examFaqs";
import { useAppData } from "@/lib/useAppData";
import { acc, text } from "@/lib/theme";

type Answer = {
  answer: string;
  markingPoints: string[];
  commonMistake: string;
};

export function ExamFaqsView() {
  const { state } = useAppData();
  /* Answers are fetched the first time a card is opened and kept for the rest
     of the session, so reopening a card costs nothing. */
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [boardId, setBoardId] = useState("cbse");
  const [subjectId, setSubjectId] = useState("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (state.boardId) setBoardId(state.boardId);
  }, [state.boardId]);

  const boardLabel =
    EXAM_BOARDS.find((entry) => entry.id === boardId)?.name ?? "";

  const loadAnswer = async (questionId: string) => {
    if (answers[questionId] || loadingId === questionId) return;

    setLoadingId(questionId);
    setErrors((all) => ({ ...all, [questionId]: "" }));

    try {
      const response = await fetch("/api/exam-faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, boardId }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setErrors((all) => ({
          ...all,
          [questionId]: payload.error ?? "Could not write the answer.",
        }));
        return;
      }

      setAnswers((all) => ({ ...all, [questionId]: payload as Answer }));
    } catch {
      setErrors((all) => ({
        ...all,
        [questionId]: "Could not reach the server. Check your connection.",
      }));
    } finally {
      setLoadingId(null);
    }
  };

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return EXAM_FAQ_GROUPS.map((group) => ({
      ...group,
      questions: group.questions.filter(
        (question) => !needle || question.prompt.toLowerCase().includes(needle),
      ),
    })).filter(
      (group) =>
        group.questions.length > 0 &&
        (subjectId === "all" || group.subjectId === subjectId),
    );
  }, [subjectId, query]);

  const shown = groups.reduce((total, group) => total + group.questions.length, 0);

  return (
    <div>
      <p
        className="font-mono text-[11.5px] font-bold uppercase tracking-[0.16em]"
        style={{ color: acc() }}
      >
        Exam FAQs
      </p>
      <h1
        className="font-display mt-3 text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.4rem]"
        style={{ color: text() }}
      >
        The questions students always get wrong.
      </h1>
      <p className="mt-2 max-w-3xl text-[15px]" style={{ color: text(0.6) }}>
        Full-mark answers in the phrasing examiners expect, with the marking
        points broken out one by one.
      </p>

      <Panel className="mt-6 p-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <Field label="Board">
            <Select
              value={boardId}
              onChange={setBoardId}
              options={EXAM_BOARDS.filter((entry) => !entry.comingSoon).map(
                (entry) => ({ value: entry.id, label: entry.name }),
              )}
            />
          </Field>

          <Field label="Subject">
            <Select
              value={subjectId}
              onChange={setSubjectId}
              options={[
                { value: "all", label: "All subjects" },
                ...SUBJECTS.map((entry) => ({
                  value: entry.id,
                  label: entry.name,
                })),
              ]}
            />
          </Field>

          <Field label="Search">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: text(0.4) }}
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="e.g. activation energy"
                aria-label="Search questions"
                className="h-12 w-full rounded-xl pl-9 pr-3 text-[14.5px] outline-none"
                style={{
                  background: text(0.04),
                  border: `1px solid ${text(0.12)}`,
                  color: text(0.9),
                }}
              />
            </div>
          </Field>
        </div>
      </Panel>

      <p className="mt-5 font-mono text-[12px]" style={{ color: text(0.45) }}>
        {shown} of {TOTAL_FAQ_QUESTIONS} questions
        {boardLabel ? ` · ${boardLabel}` : ""}
      </p>

      <div className="mt-4 space-y-8">
        {groups.length === 0 && (
          <Panel className="p-8 text-center">
            <p className="text-[14.5px]" style={{ color: text(0.6) }}>
              Nothing matches those filters.
            </p>
          </Panel>
        )}

        {groups.map((group) => (
          <section key={`${group.subject}-${group.topic}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                className="font-mono text-[12.5px] font-bold uppercase tracking-[0.14em]"
                style={{ color: acc() }}
              >
                {group.subject} · {group.topic}
              </h2>

              <div className="flex gap-2">
                <Button variant="glass" size="sm" disabled>
                  Load 3 questions
                </Button>
                <Button variant="glass" size="sm" disabled>
                  <Layers className="h-4 w-4" />
                  Quiz mode
                </Button>
              </div>
            </div>

            <ul className="mt-3 space-y-2">
              {group.questions.map((question) => {
                const open = openId === question.id;

                return (
                  <li key={question.id}>
                    <Panel className="overflow-hidden">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => {
                          const next = open ? null : question.id;
                          setOpenId(next);
                          if (next) void loadAnswer(question.id);
                        }}
                        className="flex w-full items-center gap-3 px-5 py-4 text-left"
                      >
                        <ChevronDown
                          className="h-4 w-4 shrink-0 transition-transform"
                          style={{
                            color: text(0.45),
                            transform: open ? "rotate(180deg)" : undefined,
                          }}
                        />
                        <span
                          className="text-[15px] font-bold leading-snug"
                          style={{ color: text() }}
                        >
                          {question.prompt}
                        </span>
                      </button>

                      {open && (
                        <div className="px-5 pb-5 pl-12">
                          {loadingId === question.id && (
                            <p
                              className="flex items-center gap-2 text-[14px]"
                              style={{ color: text(0.55) }}
                            >
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Writing the answer…
                            </p>
                          )}

                          {errors[question.id] && (
                            <p className="text-[14px]" style={{ color: text(0.7) }}>
                              {errors[question.id]}
                            </p>
                          )}

                          {answers[question.id] && (
                            <>
                              <p
                                className="text-[14.5px] leading-[1.7]"
                                style={{ color: text(0.85) }}
                              >
                                {answers[question.id].answer}
                              </p>

                              <p
                                className="mt-4 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em]"
                                style={{ color: text(0.45) }}
                              >
                                Marking points
                              </p>
                              <ul className="mt-2 space-y-1.5">
                                {answers[question.id].markingPoints.map(
                                  (point, position) => (
                                    <li
                                      key={position}
                                      className="flex gap-2 text-[14px] leading-[1.6]"
                                      style={{ color: text(0.75) }}
                                    >
                                      <span
                                        className="font-mono text-[12px]"
                                        style={{ color: acc() }}
                                      >
                                        ✓
                                      </span>
                                      {point}
                                    </li>
                                  ),
                                )}
                              </ul>

                              <p
                                className="mt-4 rounded-xl p-3.5 text-[13.5px] leading-[1.6]"
                                style={{
                                  background: acc(0.08),
                                  border: `1px solid ${acc(0.22)}`,
                                  color: text(0.75),
                                }}
                              >
                                <span className="font-bold">Most common slip: </span>
                                {answers[question.id].commonMistake}
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </Panel>
                  </li>
                );
              })}
            </ul>

            <p
              className="mt-3 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em]"
              style={{ color: text(0.35) }}
            >
              <FileText className="h-3.5 w-3.5" />
              Exam questions
            </p>
          </section>
        ))}
      </div>

      <p className="mt-8 text-[12.5px] italic" style={{ color: text(0.45) }}>
        Answers are written by AI in mark-scheme style — they are not the
        published mark scheme. Check anything that contradicts your board&apos;s
        own wording.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="block font-mono text-[10.5px] font-bold uppercase tracking-[0.16em]"
        style={{ color: text(0.45) }}
      >
        {label}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-12 w-full cursor-pointer rounded-xl px-3 text-[14.5px] outline-none"
      style={{
        background: text(0.04),
        border: `1px solid ${text(0.12)}`,
        color: text(0.9),
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} style={{ color: "#111" }}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
