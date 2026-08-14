"use client";

/* Tests set for this class.
 *
 * Distinct from Mock Papers, which are the student's own practice, and from
 * Practice, which is one question at a time with the answer straight after.
 * These are set by a teacher, marked against the whole class, and the score
 * goes on a report — so the screen says who set it and when it closes, and
 * does not offer a retry the server would refuse.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Loader2 } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { acc, text } from "@/lib/theme";

type Test = {
  id: string;
  title: string;
  kind: string;
  durationMinutes: number | null;
  outOf: number | null;
  attemptsUsed: number;
  attemptsAllowed: number;
  bestScore: number | null;
  notYetOpen: boolean;
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function TestsView() {
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const response = await fetch("/api/tests");
        const payload = await response.json();
        if (live) setTests(payload.tests ?? []);
      } catch {
        /* The empty state below is the right screen either way. */
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12" style={{ color: text(0.5) }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-[14px]">Loading your tests…</span>
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
          Tests
        </h1>
        <p className="mt-2 text-[14px]" style={{ color: text(0.6) }}>
          These are set by your teacher. Practice and mock papers are separate — those are your
          own, these belong to the class.
        </p>
      </header>

      {tests.length === 0 && (
        <Panel className="p-6">
          <p className="text-[14px]" style={{ color: text(0.6) }}>
            No tests set yet. Whenever your teacher sets one, it will show up here.
          </p>
        </Panel>
      )}

      {tests.map((test) => {
        const used = test.attemptsUsed >= test.attemptsAllowed;
        const shut = test.closed || test.notYetOpen || used;

        return (
          <Panel key={test.id} className="space-y-3 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-bold" style={{ color: text(0.9) }}>
                {test.title}
              </h2>

              {test.bestScore !== null && (
                <span className="font-mono text-[14px]" style={{ color: text(0.75) }}>
                  {test.bestScore}
                  {test.outOf ? `/${test.outOf}` : ""}
                </span>
              )}
            </div>

            <p className="text-[13px]" style={{ color: text(0.55) }}>
              {test.kind}
              {test.durationMinutes ? ` · ${test.durationMinutes} min` : ""}
              {test.outOf ? ` · ${test.outOf} marks` : ""}
              {test.attemptsAllowed > 1 ? ` · ${test.attemptsUsed}/${test.attemptsAllowed} attempts` : ""}
            </p>

            {/* Why it cannot be opened, in the words that matter. "Closed" on
                its own sends a fourteen-year-old to their teacher; a date
                answers the question they were about to ask. */}
            {test.notYetOpen && test.opensAt && (
              <p className="text-[13px]" style={{ color: text(0.6) }}>
                Opens {when(test.opensAt)}.
              </p>
            )}

            {test.closed && test.closesAt && (
              <p className="text-[13px]" style={{ color: text(0.6) }}>
                Closed on {when(test.closesAt)}.
              </p>
            )}

            {used && !test.closed && (
              <p className="text-[13px]" style={{ color: text(0.6) }}>
                You have already sat this one.
              </p>
            )}

            {!shut && (
              <Link
                href={`/tests/${test.id}`}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold"
                style={{ background: acc(0.14), color: text(0.9) }}
              >
                <ClipboardList className="h-4 w-4" />
                {test.closesAt ? `Start — open until ${when(test.closesAt)}` : "Start"}
              </Link>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
