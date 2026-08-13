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

import { Button } from "@/components/ui/button";

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
    <main className="mx-auto max-w-3xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] opacity-50">
            Safety
          </p>
          <h1 className="font-display mt-1 text-[1.8rem] font-extrabold tracking-[-0.03em]">
            Review queue
          </h1>
        </div>

        <div className="flex gap-2 text-[13px]">
          {["open", "actioned", "dismissed", "all"].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStatus(option)}
              className={`rounded-lg px-3 py-1.5 ${
                status === option ? "bg-black/10 dark:bg-white/15" : "opacity-60"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* The number that comes before everything else. */}
      <div
        className="mt-6 rounded-xl border p-5"
        style={{
          borderColor: openUrgent > 0 ? "rgb(220 38 38 / 0.5)" : "rgb(128 128 128 / 0.2)",
        }}
      >
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          {openUrgent > 0 && <AlertTriangle className="h-4 w-4 text-red-600" />}
          {openUrgent === 0
            ? "Koi urgent flag pending nahi hai."
            : `${openUrgent} urgent flag${openUrgent === 1 ? "" : "s"} waiting.`}
        </p>

        {openUrgent > 0 && (
          <p className="mt-1.5 text-[13px] opacity-70">
            Har ek ke peeche ek bachcha hai jisne kuch aisa likha jo pareshan
            karta hai. Ye pehle dekho.
          </p>
        )}
      </div>

      {message && (
        <p className="mt-4 rounded-xl bg-black/5 px-4 py-3 text-[14px] dark:bg-white/10">
          {message}
        </p>
      )}

      {loading ? (
        <div className="mt-8 flex items-center gap-2 opacity-60">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[14px]">Loading…</span>
        </div>
      ) : flags.length === 0 ? (
        <p className="mt-8 text-[14px] opacity-55">Nothing in this state.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {flags.map((flag) => (
            <article
              key={flag.id}
              className="rounded-xl border p-5"
              style={{
                borderColor:
                  flag.severity === "urgent"
                    ? "rgb(220 38 38 / 0.4)"
                    : "rgb(128 128 128 / 0.2)",
              }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[15px] font-bold">
                  {CATEGORY_LABEL[flag.category] ?? flag.category}
                  {flag.severity === "urgent" && (
                    <span className="ml-2 text-[12px] font-semibold text-red-600">
                      urgent
                    </span>
                  )}
                </h2>

                <span className="text-[12px] opacity-55">
                  {flag.studentName || flag.studentId.slice(0, 8)} ·{" "}
                  {new Date(flag.createdAt).toLocaleString("en-IN")} · {flag.source}
                  {flag.score !== null ? ` · ${flag.score}` : ""}
                </span>
              </div>

              {/* The only place in the product a student's flagged words are
                  shown. See the note at the top of the route. */}
              {flag.excerpt && (
                <blockquote
                  className="mt-3 rounded-lg border-l-2 px-3 py-2 text-[14px]"
                  style={{ borderColor: "rgb(128 128 128 / 0.4)" }}
                >
                  {flag.excerpt}
                </blockquote>
              )}

              {flag.reviewNote && (
                <p className="mt-2 text-[13px] opacity-70">
                  <span className="font-semibold">Review:</span> {flag.reviewNote}
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
                    placeholder="Kya kiya? (parent ko call, school ko bataya, false positive…)"
                    className="w-full rounded-lg border border-black/10 bg-transparent p-2.5 text-[13px] dark:border-white/15"
                  />

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => void decide(flag.id, "actioned")}
                      disabled={busy === flag.id}
                      className="px-3 py-1.5 text-[13px]"
                    >
                      {busy === flag.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                          Actioned
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      onClick={() => void decide(flag.id, "dismissed")}
                      disabled={busy === flag.id}
                      className="px-3 py-1.5 text-[13px]"
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      False positive
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[12px] opacity-50">
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

      <p className="mt-8 text-[13px] opacity-55">
        Ye records 12 mahine baad apne aap delete ho jaate hain. Jo self-harm
        wale flags hain, unpe parent ko pehle hi message chala jaata hai — is
        screen ka kaam ye tay karna hai ki wo kaafi tha ya nahi.
      </p>
    </main>
  );
}
