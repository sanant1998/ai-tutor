"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Stethoscope, Target } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { chosenSubjects } from "@/lib/study";
import { useAppData } from "@/lib/useAppData";
import { acc, acc2, text } from "@/lib/theme";

type Sheet = {
  diagnosis: string;
  priority: string;
  dominant: { id: string; name: string; fix: string; sendsBackTo: string };
  breakdown: { id: string; name: string; count: number }[];
  readiness: { score: number; band: string; reason: string };
  questions: { prompt: string; marks: number; targets: string; watchFor: string }[];
};

/* Layer 4. Everything else in the app produces practice about a chapter; this
   produces practice about a weakness, built from the student's own classified
   mistakes. */
export function FixSheetView() {
  const { state } = useAppData();
  const [subjectId, setSubjectId] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const subjects = chosenSubjects(state);

  const build = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/fix-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId: subjectId || undefined }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Could not build your fix sheet.");
        return;
      }

      setSheet(payload as Sheet);
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const worst = sheet?.breakdown[0]?.count ?? 1;

  return (
    <div>
      <p
        className="font-mono text-[11.5px] font-bold uppercase tracking-[0.16em]"
        style={{ color: acc() }}
      >
        <Stethoscope className="mr-1.5 inline h-3.5 w-3.5" />
        Layer 4 · Fix sheet
      </p>

      <h1
        className="font-display mt-3 text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.4rem]"
        style={{ color: text() }}
      >
        Practice built from your own mistakes.
      </h1>
      <p className="mt-2 max-w-2xl text-[15px]" style={{ color: text(0.6) }}>
        Every answer you get marked is classified — concept gap, formula gap,
        silly mistake. This turns that record into questions aimed only at
        what keeps costing you marks.
      </p>

      <Panel className="mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <label
              className="block font-mono text-[10.5px] font-bold uppercase tracking-[0.16em]"
              style={{ color: text(0.45) }}
            >
              Subject
            </label>
            <select
              aria-label="Subject"
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              className="mt-2 h-11 w-full cursor-pointer rounded-xl px-3 text-[14.5px] outline-none"
              style={{
                background: text(0.04),
                border: `1px solid ${text(0.12)}`,
                color: text(0.9),
              }}
            >
              <option value="" style={{ color: "#111" }}>
                Everything
              </option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id} style={{ color: "#111" }}>
                  {subject.glyph} {subject.name}
                </option>
              ))}
            </select>
          </div>

          <Button disabled={loading} onClick={build}>
            {loading ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin" />
            ) : (
              <Target className="h-[18px] w-[18px]" />
            )}
            {loading ? "Reading your mistakes…" : "Build my fix sheet"}
          </Button>
        </div>
      </Panel>

      {error && (
        <Panel className="mt-5 flex items-start gap-3 p-5">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: acc() }}
          />
          <p className="text-[14.5px] leading-[1.6]" style={{ color: text(0.8) }}>
            {error}
          </p>
        </Panel>
      )}

      {sheet && (
        <>
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_300px]">
            <Panel className="p-6">
              <p
                className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ color: acc() }}
              >
                Diagnosis
              </p>
              <p
                className="mt-3 text-[15.5px] leading-[1.7]"
                style={{ color: text(0.85) }}
              >
                {sheet.diagnosis}
              </p>

              <div
                className="mt-5 rounded-2xl p-4"
                style={{ background: acc(0.09), border: `1px solid ${acc(0.25)}` }}
              >
                <p
                  className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: acc() }}
                >
                  Fix this first
                </p>
                <p
                  className="mt-2 text-[15px] font-bold leading-[1.55]"
                  style={{ color: text() }}
                >
                  {sheet.priority}
                </p>
                <p className="mt-2 text-[13.5px]" style={{ color: text(0.65) }}>
                  {sheet.dominant.fix}
                </p>
              </div>
            </Panel>

            <div className="space-y-5">
              <Panel className="p-5">
                <p
                  className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: acc() }}
                >
                  Readiness
                </p>
                <p
                  className="font-display mt-2 text-[2.4rem] font-extrabold leading-none tracking-[-0.03em]"
                  style={{ color: text() }}
                >
                  {sheet.readiness.score}
                  <span className="text-[1rem]" style={{ color: text(0.4) }}>
                    {" "}
                    / 100
                  </span>
                </p>
                <p
                  className="mt-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: acc2() }}
                >
                  {sheet.readiness.band}
                </p>
                <p className="mt-3 text-[13.5px]" style={{ color: text(0.6) }}>
                  {sheet.readiness.reason}
                </p>
              </Panel>

              <Panel className="p-5">
                <p
                  className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: acc() }}
                >
                  Where marks go
                </p>
                <ul className="mt-3 space-y-2.5">
                  {sheet.breakdown.map((entry) => (
                    <li key={entry.id}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className="text-[13.5px] font-bold"
                          style={{ color: text(0.85) }}
                        >
                          {entry.name}
                        </span>
                        <span
                          className="font-mono text-[12px]"
                          style={{ color: text(0.5) }}
                        >
                          {entry.count}×
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-1.5 overflow-hidden rounded-full"
                        style={{ background: text(0.08) }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(entry.count / worst) * 100}%`,
                            background: acc(),
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </div>

          <ol className="mt-5 space-y-3">
            {sheet.questions.map((question, index) => (
              <li key={index}>
                <Panel className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p
                      className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
                      style={{ color: acc() }}
                    >
                      {index + 1} · targets {question.targets}
                    </p>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold"
                      style={{ background: text(0.06), color: text(0.6) }}
                    >
                      {question.marks} {question.marks === 1 ? "mark" : "marks"}
                    </span>
                  </div>

                  <p
                    className="mt-3 whitespace-pre-wrap text-[15.5px] font-bold leading-[1.55]"
                    style={{ color: text() }}
                  >
                    {question.prompt}
                  </p>

                  <p
                    className="mt-3 rounded-xl p-3.5 text-[13.5px] leading-[1.6]"
                    style={{
                      background: text(0.04),
                      border: `1px solid ${text(0.09)}`,
                      color: text(0.7),
                    }}
                  >
                    <span className="font-bold">Watch for: </span>
                    {question.watchFor}
                  </p>
                </Panel>
              </li>
            ))}
          </ol>

          <p className="mt-5 text-[12.5px] italic" style={{ color: text(0.45) }}>
            Built from your last 40 marked answers. Answer more and this sheet
            sharpens.
          </p>
        </>
      )}
    </div>
  );
}
