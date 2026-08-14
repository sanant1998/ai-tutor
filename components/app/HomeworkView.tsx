"use client";

/* Homework set by the teacher.
 *
 * The whole screen is one question — "what do I owe, and by when" — so
 * anything not answering that is left off. No filters, no tabs, no archive: a
 * class has three or four open assignments, and a student who has to choose a
 * tab to find them has already been given a reason to close the app.
 *
 * Overdue is said in words rather than shown as a red date, because "2 din
 * late" prompts an action and a red 12 Nov prompts a calculation. */

import { useCallback, useEffect, useState } from "react";
import { Check, Clock, Loader2 } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { acc, text } from "@/lib/theme";

type Assignment = {
  id: string;
  note: string | null;
  chapter: string | null;
  dueOn: string | null;
  maxMarks: number | null;
  overdue: boolean;
  submission: {
    content: string | null;
    submittedAt: string | null;
    marks: number | null;
    feedback: string | null;
    gradedAt: string | null;
    status: string;
  } | null;
};

function dueIn(dueOn: string): string {
  const days = Math.round((new Date(dueOn).getTime() - Date.now()) / 86_400_000);

  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days > 1) return `due in ${days} days`;
  if (days === -1) return "was due yesterday";
  return `${Math.abs(days)} days late`;
}

export function HomeworkView() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/assignments");
      const payload = await response.json();
      setAssignments(payload.assignments ?? []);
    } catch {
      /* The empty state is the right screen either way. */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (id: string) => {
    setBusy(id);
    setMessage("");

    try {
      const response = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: id, content: drafts[id] ?? "" }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error ?? "That could not be submitted.");
        return;
      }

      await load();
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12" style={{ color: text(0.5) }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-[14px]">Loading your homework…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: text(0.45) }}>
          Class
        </p>
        <h1 className="font-display mt-1 text-[1.8rem] font-extrabold tracking-[-0.03em]" style={{ color: text() }}>
          Homework
        </h1>
      </header>

      {message && (
        <p className="rounded-xl px-4 py-3 text-[14px]" style={{ background: acc(0.1), color: text(0.85) }}>
          {message}
        </p>
      )}

      {assignments.length === 0 && (
        <Panel className="p-6">
          <p className="text-[14px]" style={{ color: text(0.6) }}>
            No homework right now. Whatever your teacher sets will show up here.
          </p>
        </Panel>
      )}

      {assignments.map((assignment) => {
        const marked = assignment.submission?.gradedAt;
        const submitted = assignment.submission?.submittedAt;

        return (
          <Panel key={assignment.id} className="space-y-3 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-bold" style={{ color: text(0.9) }}>
                {assignment.chapter ?? assignment.note ?? "Homework"}
              </h2>

              {assignment.dueOn && (
                <span
                  className="flex items-center gap-1.5 text-[13px]"
                  style={{ color: assignment.overdue ? "#dc2626" : text(0.55) }}
                >
                  <Clock className="h-3.5 w-3.5" />
                  {dueIn(assignment.dueOn)}
                </span>
              )}
            </div>

            {assignment.chapter && assignment.note && (
              <p className="text-[13.5px]" style={{ color: text(0.65) }}>
                {assignment.note}
              </p>
            )}

            {/* Marked: the mark and what the teacher said, and the work is
                read-only. Nothing to do here, so nothing that looks like it. */}
            {marked ? (
              <div className="space-y-2 rounded-xl px-4 py-3" style={{ background: acc(0.08) }}>
                <p className="flex items-center gap-2 text-[14px] font-bold" style={{ color: text(0.9) }}>
                  <Check className="h-4 w-4" />
                  {assignment.submission?.marks}
                  {assignment.maxMarks ? `/${assignment.maxMarks}` : ""}
                </p>
                {assignment.submission?.feedback && (
                  <p className="text-[13.5px]" style={{ color: text(0.7) }}>
                    {assignment.submission.feedback}
                  </p>
                )}
              </div>
            ) : (
              <>
                <textarea
                  value={drafts[assignment.id] ?? assignment.submission?.content ?? ""}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [assignment.id]: event.target.value }))
                  }
                  rows={5}
                  placeholder="Write your answer here"
                  className="w-full rounded-xl bg-transparent p-3 text-[14px]"
                  style={{ border: `1px solid ${text(0.15)}`, color: text(0.9) }}
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12.5px]" style={{ color: text(0.5) }}>
                    {submitted
                      ? "Submitted — you can still change it until it is marked."
                      : "You cannot change it once it has been marked."}
                  </p>

                  <Button
                    type="button"
                    disabled={busy === assignment.id}
                    onClick={() => void submit(assignment.id)}
                  >
                    {busy === assignment.id
                      ? "Submitting…"
                      : submitted
                        ? "Update"
                        : "Submit"}
                  </Button>
                </div>
              </>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
