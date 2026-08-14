"use client";

/* Who did what to whose school.
 *
 * The screen an IT head asks for in the second meeting, and the reason it is
 * worth having at all is that the answer is specific: not "an admin changed
 * something on Tuesday" but "principal@ imported 42 students into 8-A at
 * 09:14, and here is the row it wrote".
 *
 * Filters rather than search. The three questions actually asked are "what
 * happened to this child", "what has this school done", and "who has been
 * assigning seats" — an entity id, an org, and an action prefix. A free-text
 * box over a table of ids answers none of them. */

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

type Entry = {
  id: string;
  at: string;
  actor: string;
  actorRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  org: string;
};

/* The actions this product actually writes, so the filter is a list rather
   than a text box somebody has to guess the vocabulary of. */
const ACTIONS = [
  { value: "", label: "Everything" },
  { value: "school", label: "School onboarding" },
  { value: "licence", label: "Licences and seats" },
  { value: "roster", label: "Roster imports" },
  { value: "section", label: "Sections" },
  { value: "teacher", label: "Teacher assignment" },
];

function when(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function AuditTrail() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [action, setAction] = useState("");
  const [entityId, setEntityId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [nextBefore, setNextBefore] = useState<string | null>(null);

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);

      try {
        const params = new URLSearchParams();
        if (action) params.set("action", action);
        if (entityId.trim()) params.set("entityId", entityId.trim());
        if (before) params.set("before", before);

        const response = await fetch(`/api/admin/audit?${params}`);
        const payload = await response.json();

        if (!response.ok) {
          setMessage(payload.error ?? "Could not load.");
          return;
        }

        /* Appended when paging, replaced when filtering — otherwise "older"
           twice and then a filter change leaves the old rows underneath. */
        setEntries((current) => (before ? [...current, ...payload.entries] : payload.entries));
        setNextBefore(payload.nextBefore ?? null);
        setMessage("");
      } finally {
        setLoading(false);
      }
    },
    [action, entityId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
      <header>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#667085]">
          Admin
        </p>
        <h1 className="font-display mt-1 flex items-center gap-2 text-[1.8rem] font-extrabold tracking-[-0.03em]">
          <ShieldCheck className="h-6 w-6 opacity-70" />
          Audit trail
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] opacity-60">
          Append-only. Nothing here can be edited or deleted from any screen — on an erasure
          request the payload is emptied and the fact of the action stays, so who did what and
          when remains provable.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <select
          value={action}
          onChange={(event) => setAction(event.target.value)}
          className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
        >
          {ACTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <input
          value={entityId}
          onChange={(event) => setEntityId(event.target.value)}
          placeholder="Entity id — a student, a section, a licence"
          className="min-w-[280px] flex-1 rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
        />
      </div>

      {message && (
        <p className="rounded-xl bg-black/5 px-4 py-3 text-[14px] dark:bg-white/10">{message}</p>
      )}

      {loading && entries.length === 0 && <Loader2 className="h-4 w-4 animate-spin opacity-60" />}

      {!loading && entries.length === 0 && !message && (
        <p className="text-[14px] text-[#667085]">
          Nothing recorded yet. Rows appear here when a school is onboarded, seats are allotted,
          a roster is imported or a teacher is assigned.
        </p>
      )}

      {entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-black/10 text-[11px] uppercase tracking-[0.12em] opacity-50 dark:border-white/10">
              <tr>
                <th className="py-2 pr-3 font-semibold">When</th>
                <th className="py-2 pr-3 font-semibold">Who</th>
                <th className="py-2 pr-3 font-semibold">Did what</th>
                <th className="py-2 pr-3 font-semibold">To</th>
                <th className="py-2 font-semibold">School</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-3 whitespace-nowrap font-mono text-[12px] opacity-70">
                    {when(entry.at)}
                  </td>
                  <td className="py-2 pr-3">
                    {entry.actor}
                    {entry.actorRole && (
                      <span className="ml-1.5 text-[#667085]">· {entry.actorRole}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono text-[12px]">{entry.action}</td>
                  <td className="py-2 pr-3 font-mono text-[12px] opacity-65">
                    {entry.entityType ? `${entry.entityType} ${entry.entityId ?? ""}` : "—"}
                  </td>
                  <td className="py-2 opacity-70">{entry.org}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextBefore && (
        <Button
          type="button"
          variant="ghost"
          disabled={loading}
          onClick={() => void load(nextBefore)}
        >
          {loading ? "Loading…" : "Older"}
        </Button>
      )}
    </main>
  );
}
