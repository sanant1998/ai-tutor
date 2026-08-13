"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CalendarPlus, Trash2, X } from "lucide-react";

import { Kicker, Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unitsFor } from "@/lib/onboarding";
import { useAppData } from "@/lib/useAppData";
import {
  EXAM_KINDS,
  chosenSubjects,
  chosenUnits,
  daysUntil,
  examKindLabel,
  type ExamEntry,
  type ExamKind,
} from "@/lib/study";
import { acc, acc2, text } from "@/lib/theme";

export function ExamsView() {
  const { state, exams, now, updateExams } = useAppData();
  const [adding, setAdding] = useState(false);

  const [kind, setKind] = useState<ExamKind>("board");
  const [subjectId, setSubjectId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [date, setDate] = useState("");

  /* Default the picker to the first subject once the answers land. */
  useEffect(() => {
    setSubjectId((current) => current || state.subjectIds[0] || "");
  }, [state.subjectIds]);

  const subjects = chosenSubjects(state);
  const units = subjectId ? chosenUnits(state, subjectId) : [];

  const commit = (next: ExamEntry[]) => {
    updateExams([...next].sort((a, b) => a.date.localeCompare(b.date)));
  };

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    if (!subjectId || !date) return;

    commit([
      ...exams,
      { id: `${kind}-${subjectId}-${unitId}-${date}`, kind, subjectId, unitId, date },
    ]);
    setDate("");
    setAdding(false);
  };

  const remove = (id: string) => commit(exams.filter((exam) => exam.id !== id));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="font-display text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.4rem]"
            style={{ color: text() }}
          >
            Exams
          </h1>
          <p className="mt-2 max-w-2xl text-[15px]" style={{ color: text(0.6) }}>
            Add any test that&apos;s coming up — mocks, board exams, term tests,
            school tests. Your urgency timer and roadmap adapt to whichever
            you&apos;re focused on.
          </p>
        </div>

        <Button onClick={() => setAdding((value) => !value)}>
          {adding ? (
            <>
              <X className="h-[18px] w-[18px]" />
              Cancel
            </>
          ) : (
            <>
              <CalendarPlus className="h-[18px] w-[18px]" />
              Add an exam
            </>
          )}
        </Button>
      </div>

      {adding && (
        <Panel className="mt-6 p-5 sm:p-6">
          <Kicker>New exam</Kicker>

          <form onSubmit={add} className="mt-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Type">
                <Select
                  value={kind}
                  onChange={(value) => setKind(value as ExamKind)}
                  options={EXAM_KINDS.map((entry) => ({
                    value: entry.id,
                    label: entry.label,
                  }))}
                />
              </Field>

              <Field label="Subject">
                <Select
                  value={subjectId}
                  onChange={(value) => {
                    setSubjectId(value);
                    setUnitId("");
                  }}
                  options={
                    subjects.length
                      ? subjects.map((subject) => ({
                          value: subject.id,
                          label: subject.name,
                        }))
                      : [{ value: "", label: "No subjects yet" }]
                  }
                />
              </Field>

              <Field label="Unit">
                <Select
                  value={unitId}
                  onChange={setUnitId}
                  options={[
                    { value: "", label: "Whole subject" },
                    ...units.map((unit) => ({
                      value: unit.id,
                      label: `${unit.code} · ${unit.name}`,
                    })),
                  ]}
                />
              </Field>

              <Field label="Date">
                <Input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </Field>
            </div>

            <Button type="submit" className="mt-5" disabled={!subjectId || !date}>
              <CalendarPlus className="h-[18px] w-[18px]" />
              Save exam
            </Button>
          </form>
        </Panel>
      )}

      {exams.length === 0 ? (
        <Panel className="mt-6 p-10 text-center sm:p-14">
          <CalendarDays className="mx-auto h-11 w-11" style={{ color: text(0.4) }} />
          <p
            className="mx-auto mt-5 max-w-xl text-[14.5px] leading-[1.6]"
            style={{ color: text(0.62) }}
          >
            No exams scheduled yet. Don&apos;t have one? Your roadmap still works
            as an efficient revision plan.
          </p>
          <Button className="mt-6" onClick={() => setAdding(true)}>
            <CalendarPlus className="h-[18px] w-[18px]" />
            Add your first exam
          </Button>
        </Panel>
      ) : (
        <Panel className="mt-6 p-5 sm:p-6">
          <Kicker>Scheduled</Kicker>

          <ul className="mt-4 space-y-2">
            {exams.map((exam) => {
              const subject = subjects.find((item) => item.id === exam.subjectId);
              const unit = unitsFor(state.boardId, state.classLevel, exam.subjectId).find(
                (item) => item.id === exam.unitId,
              );
              const days = now ? daysUntil(exam.date, now) : null;
              const soon = days !== null && days <= 14 && days >= 0;

              return (
                <li
                  key={exam.id}
                  className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{
                    background: text(0.03),
                    border: `1px solid ${soon ? acc2(0.4) : text(0.07)}`,
                  }}
                >
                  <span aria-hidden="true" className="text-[18px]">
                    {subject?.glyph ?? "📘"}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[14.5px] font-bold"
                      style={{ color: text() }}
                    >
                      {subject?.name ?? exam.subjectId}
                      {unit ? ` · ${unit.code}` : ""}
                    </span>
                    <span
                      className="block font-mono text-[11.5px]"
                      style={{ color: text(0.45) }}
                    >
                      {examKindLabel(exam.kind)} · {exam.date}
                    </span>
                  </span>

                  <span
                    className="shrink-0 font-mono text-[13px] font-bold"
                    style={{ color: soon ? acc2() : acc() }}
                  >
                    {days === null ? "—" : days >= 0 ? `${days}d` : "past"}
                  </span>

                  <button
                    type="button"
                    onClick={() => remove(exam.id)}
                    aria-label={`Remove ${subject?.name ?? "exam"} date`}
                    style={{ color: text(0.4) }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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
