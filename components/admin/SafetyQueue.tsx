"use client";

/* The reviewer's screen.
 *
 * Two things about how it is laid out are deliberate.
 *
 * URGENT FIRST, AND COUNTED AT THE TOP. Somebody opening this at nine in the
 * morning needs one number before anything else: how many children are waiting.
 * If that number is not zero, nothing else on the page matters yet.
 *
 * EVERY FLAG NEEDS A DECISION, AND THE DECISION IS TWO WORDS. "Actioned" means
 * a human did something — spoke to the student, called the parent, escalated.
 * "Dismissed" means it was a false positive. A queue with a third option grows
 * a permanent middle, and a permanent middle is an unread queue with extra
 * steps.
 *
 * The reply the student saw is not shown here and does not need to be: it is
 * fixed in lib/safety/gate.ts and is the same every time. What a reviewer is
 * deciding is whether the fixed reply was enough. */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";

import { Action, Quiet } from "@/components/admin/ui";

type Flag = {
  id: string;
  studentId: string;
  studentName: string;
  sessionId: string | null;
  category: string;
  severity: string;
  excerpt: string | null;
  score: number | null;
  source: string;
  status: string;
  createdAt: string;
  handledAt: string | null;
  reviewNote: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  self_harm: "Self-harm",
  sexual: "Sexual",
  violence: "Violence",
  harassment: "Harassment",
  injection: "Prompt injection",
  off_topic: "Off topic",
};

export function SafetyQueue() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [openUrgent, setOpenUrgent] = useState(0);
  const [status, setStatus] = useState("open");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(`/api/admin/safety?status=${status}`);
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error ?? "Could not load.");
        return;
      }

      setFlags(payload.flags ?? []);
      setOpenUrgent(payload.openUrgent ?? 0);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (id: string, decision: "actioned" | "dismissed") => {
    setBusy(id);

    try {
      await fetch("/api/admin/safety", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: decision, note: notes[id] ?? "" }),
      });

      await load();
    } finally {
      setBusy("");
    }
  };

  return (
    <main className="mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#667085]">
            Safety
          </p>
          {/* Renamed. "Review queue" is now the inbox at /admin/review, and two
              screens with the same title is how somebody actions a flag on the
              one they meant to browse. */}
          <h1 className="mt-1 text-[1.9rem] font-extrabold tracking-[-0.03em] text-[#0d1015]">
            Flagged messages
          </h1>
          <p className="mt-1.5 text-[14px] text-[#4b5565]">
            Every flag a person still has to decide about.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Which flags to show"
          className="flex items-center gap-0.5 rounded-xl border border-[#e4e6ea] bg-white p-1"
        >
          {["open", "actioned", "dismissed", "all"].map((option) => {
            const active = status === option;

            return (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatus(option)}
                className={`rounded-lg px-3.5 py-1.5 text-[13.5px] font-semibold capitalize transition-colors ${
                  active ? "bg-[#eff4ff] text-[#2563eb]" : "text-[#4b5565] hover:bg-black/[0.035]"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      {/* The number that comes before everything else. */}
      {/* The number that comes before everything else. Green when it is zero
          rather than a neutral grey box: "nothing urgent" is the answer this
          screen exists to give, and a reviewer should be able to read it from
          the doorway. */}
      <div
        className={`mt-6 flex items-start gap-4 rounded-2xl border p-5 ${
          openUrgent > 0 ? "border-[#fecaca] bg-[#fef4f4]" : "border-[#dcf0e3] bg-[#f4fbf6]"
        }`}
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            openUrgent > 0 ? "bg-[#fee2e2] text-[#dc2626]" : "bg-[#dcf0e3] text-[#15803d]"
          }`}
        >
          {openUrgent > 0 ? <AlertTriangle className="h-5 w-5" /> : <Check className="h-5 w-5" />}
        </span>

        <div className="min-w-0">
          <p
            className={`text-[15px] font-bold ${
              openUrgent > 0 ? "text-[#b91c1c]" : "text-[#166534]"
            }`}
          >
            {openUrgent === 0
              ? "No urgent flags pending."
              : `${openUrgent} urgent flag${openUrgent === 1 ? "" : "s"} waiting.`}
          </p>

          <p className="mt-1 text-[13px] leading-[1.55] text-[#4b5565]">
            {openUrgent > 0
              ? "Behind each one is a child who wrote something troubling. Look at these first."
              : "Nothing urgent is outstanding. Anything below has already been decided."}
          </p>
        </div>
      </div>

      {message && (
        <p className="mt-4 rounded-xl border border-[#d6e4ff] bg-[#f4f8ff] px-4 py-3 text-[14px] text-[#1e40af]">
          {message}
        </p>
      )}

      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-[#667085]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[14px]">Loading…</span>
        </div>
      ) : flags.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-[#e9eaee] bg-white p-6 text-[14px] text-[#667085]">
          Nothing in this state.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {flags.map((flag) => (
            <article
              key={flag.id}
              className={`rounded-2xl border bg-white p-5 ${
                flag.severity === "urgent" ? "border-[#fecaca]" : "border-[#e9eaee]"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-2 text-[15px] font-bold text-[#0d1015]">
                  {CATEGORY_LABEL[flag.category] ?? flag.category}
                  {flag.severity === "urgent" && (
                    <span className="rounded-full bg-[#fee2e2] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#b91c1c]">
                      Urgent
                    </span>
                  )}
                </h2>

                <span className="text-[12px] text-[#667085]">
                  {flag.studentName || flag.studentId.slice(0, 8)} ·{" "}
                  {new Date(flag.createdAt).toLocaleString("en-IN")} · {flag.source}
                  {flag.score !== null ? ` · ${flag.score}` : ""}
                </span>
              </div>

              {/* The only place in the product a student's flagged words are
                  shown. See the note at the top of the route. */}
              {flag.excerpt && (
                <blockquote className="mt-3 rounded-lg border-l-[3px] border-[#cfd4dc] bg-[#f7f8fa] px-4 py-2.5 text-[14px] leading-[1.55] text-[#14171c]">
                  {flag.excerpt}
                </blockquote>
              )}

              {flag.reviewNote && (
                <p className="mt-2.5 text-[13px] text-[#4b5565]">
                  <span className="font-semibold text-[#14171c]">Review:</span> {flag.reviewNote}
                </p>
              )}

              {flag.status === "open" ? (
                <div className="mt-4 space-y-2">
                  <textarea
                    value={notes[flag.id] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [flag.id]: event.target.value }))
                    }
                    rows={2}
                    placeholder="What was done? (called the parent, told the school, false positive…)"
                    className="w-full rounded-lg p-3 text-[13px] outline-none transition-shadow placeholder:text-[#667085] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)]"
                  />

                  {/* Two different weights on purpose. "Actioned" is the
                      decision that closes a flag with something having been
                      done about it; "false positive" closes it with nothing
                      having been done. They should not look equally easy. */}
                  <div className="flex flex-wrap gap-2">
                    <Action
                      onClick={() => void decide(flag.id, "actioned")}
                      disabled={busy === flag.id}
                      className="px-3.5 py-2 text-[13px]"
                    >
                      {busy === flag.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Actioned
                        </>
                      )}
                    </Action>

                    <Quiet
                      onClick={() => void decide(flag.id, "dismissed")}
                      disabled={busy === flag.id}
                      className="px-3.5 py-2 text-[13px]"
                    >
                      <X className="h-3.5 w-3.5" />
                      False positive
                    </Quiet>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[12px] text-[#667085]">
                  {flag.status}
                  {flag.handledAt
                    ? ` · ${new Date(flag.handledAt).toLocaleDateString("en-IN")}`
                    : ""}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      <p className="mt-8 text-[12.5px] leading-[1.6] text-[#667085]">
        These records delete themselves after 12 months. Self-harm flags have
        already sent a message to a parent — this screen exists to decide
        whether that was enough.
      </p>
    </main>
  );
}
