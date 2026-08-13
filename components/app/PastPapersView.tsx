"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { EXAM_BOARDS, SUBJECTS, unitsFor } from "@/lib/onboarding";
import { useAppData } from "@/lib/useAppData";
import { acc, text } from "@/lib/theme";

export function PastPapersView() {
  const { state } = useAppData();
  const [boardId, setBoardId] = useState("cbse");
  const [subjectId, setSubjectId] = useState("maths");

  useEffect(() => {
    if (state.boardId) setBoardId(state.boardId);
    if (state.subjectIds[0]) setSubjectId(state.subjectIds[0]);
  }, [state.boardId, state.subjectIds]);

  const board = EXAM_BOARDS.find((entry) => entry.id === boardId);
  const subject = SUBJECTS.find((entry) => entry.id === subjectId);
  const units = unitsFor(boardId, state.classLevel, subjectId);

  const boardLabel = board?.name ?? "";
  const scope = `${boardLabel} · ${subject?.name ?? ""}`.toUpperCase();

  /* Papers live on the board's own site; a search link is honest and always
     works, where a deep link rots every time they reshuffle their CMS. */
  const searchUrl = useMemo(
    () => (unitName: string) =>
      `https://www.google.com/search?q=${encodeURIComponent(
        `${boardLabel} ${subject?.name ?? ""} ${unitName} past papers mark scheme`,
      )}`,
    [boardLabel, subject],
  );

  return (
    <div>
      <p
        className="font-mono text-[11.5px] font-bold uppercase tracking-[0.16em]"
        style={{ color: acc() }}
      >
        Past papers
      </p>
      <h1
        className="font-display mt-3 text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.4rem]"
        style={{ color: text() }}
      >
        Real papers. Real mark schemes.
      </h1>
      <p className="mt-2 text-[15px]" style={{ color: text(0.6) }}>
        Pick a subject and unit — every paper opens in a new tab, ready to
        download.
      </p>

      <Panel className="mt-6 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
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
              options={SUBJECTS.map((entry) => ({
                value: entry.id,
                label: `${entry.glyph} ${entry.name}`,
              }))}
            />
          </Field>
        </div>
      </Panel>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {units.map((unit) => (
          <a
            key={unit.id}
            href={searchUrl(unit.name)}
            target="_blank"
            rel="noreferrer noopener"
            className="block"
          >
            <Panel className="p-5 transition-transform hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: acc() }}
                  >
                    {scope}
                  </p>
                  <p
                    className="mt-2 text-[16px] font-bold"
                    style={{ color: text() }}
                  >
                    {unit.name}
                  </p>
                  <p className="mt-1 text-[13.5px]" style={{ color: text(0.55) }}>
                    All years, question papers + mark schemes.
                  </p>
                </div>

                <ExternalLink
                  className="mt-1 h-4 w-4 shrink-0"
                  style={{ color: acc() }}
                />
              </div>
            </Panel>
          </a>
        ))}
      </div>

      <p className="mt-5 text-[13px] italic" style={{ color: text(0.45) }}>
        Papers open on an external site — we don&apos;t host any PDFs ourselves.
      </p>

      <a
        href={`https://www.google.com/search?q=${encodeURIComponent(
          `${boardLabel} grade boundaries`,
        )}`}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-5 inline-block"
      >
        <Panel className="p-5 transition-transform hover:-translate-y-0.5">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[15.5px] font-bold" style={{ color: text() }}>
                {boardLabel} Grade Boundaries
              </p>
              <p className="mt-1 text-[13.5px]" style={{ color: text(0.55) }}>
                Latest grade thresholds and boundary marks.
              </p>
            </div>
            <ExternalLink className="h-4 w-4 shrink-0" style={{ color: acc() }} />
          </div>
        </Panel>
      </a>
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
