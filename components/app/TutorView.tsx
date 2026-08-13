"use client";

/* The teaching screen.
 *
 * Two things here are not decoration:
 *
 * OPTIMISTIC ECHO. The student's message appears in the thread the instant
 * they press send, and the thinking indicator appears with it. Perceived
 * latency is what a student judges, and the first token can be a second away
 * on a 4G cell. A screen that does nothing for that second reads as broken.
 *
 * THE BEAT IS VISIBLE. A student can see whether they are being taught or
 * tested, and how far through the concept they are. Hiding the structure makes
 * the tutor feel like a chat window, and a chat window is the thing this is
 * trying not to be — the point is that the lesson has a shape and finishes. */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Send, ShieldAlert, Sparkles } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { Paywall } from "@/components/app/Paywall";
import { SpeakButton } from "@/components/app/SpeakButton";
import { VoiceButton } from "@/components/app/VoiceButton";
import { TutorMessage } from "@/components/app/Maths";
import { Button } from "@/components/ui/button";
import { acc, text } from "@/lib/theme";

type Beat = "HOOK" | "TEACH" | "CHECK" | "RETEACH" | "SUMMARY" | "DONE";

type Turn = {
  role: "tutor" | "student";
  content: string;
  beat: Beat;
  pending?: boolean;
  /* Known for stored turns, and for a streamed one once its done event has
     arrived. The speaker button needs it because the route reads the text from
     the row rather than taking it from the browser. */
  seq?: number;
};

type SessionState = {
  sessionId: string;
  beat: Beat;
  status: string;
  turnsUsed: number;
  topic: { id: string; title: string } | null;
  chapter: string | null;
  concept: { id: string; title: string; seq: number } | null;
  conceptCount: number;
  conceptIndex: number;
  limits: { maxTurns: number; sessionMinutes: number };
  turns: Turn[];
};

const BEAT_LABEL: Record<Beat, string> = {
  HOOK: "Shuruaat",
  TEACH: "Samjho",
  CHECK: "Check",
  RETEACH: "Ek baar aur",
  SUMMARY: "Nichod",
  DONE: "Ho gaya",
};

const BEAT_HINT: Record<Beat, string> = {
  HOOK: "Padho, phir batao kya lagta hai.",
  TEACH: "Samajh aaya to 'samajh gaya' likho — nahi aaya to bhi likho.",
  CHECK: "Apna jawab likho. Galat hone se kuch nahi bigadta.",
  RETEACH: "Ab dobara — is baar alag tareeke se.",
  SUMMARY: "Aaj ka nichod.",
  DONE: "Ye concept poora hua.",
};

export function TutorView({ topicId }: { topicId: string }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  const [paywalled, setPaywalled] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* --- Start or resume --------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/tutor/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topicId }),
        });

        const payload = await response.json();

        if (!response.ok) {
          if (cancelled) return;

          /* 402 is the paywall and gets its own screen, not an error line —
             a parent who has just finished the free chapter is the most
             valuable reader this app has and deserves better than red text. */
          if (response.status === 402) {
            setPaywalled(true);
            return;
          }

          setError(
            payload.blockedBy?.length
              ? `Pehle ye poora karo: ${payload.blockedBy.map((topic: { title: string }) => topic.title).join(", ")}`
              : (payload.error ?? "Session shuru nahi ho paaya."),
          );
          return;
        }

        const state = await fetch(`/api/tutor/session/${payload.sessionId}`).then((r) => r.json());
        if (cancelled) return;

        setSession(state);
        setTurns(state.turns ?? []);

        /* A brand-new session has no turns, so the tutor has not spoken. Nudge
           it into the hook without making the student type "start" at a blank
           screen. */
        if ((state.turns ?? []).length === 0) void send("", state.sessionId);
      } catch {
        if (!cancelled) setError("Network problem. Dobara try karo.");
      }
    })();

    return () => {
      cancelled = true;
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [topicId]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, streaming]);

  /* Focus back to the composer when a turn finishes. Without it a keyboard
     user tabs through the entire transcript to answer every question, and the
     transcript grows with each one. */
  useEffect(() => {
    if (!streaming) inputRef.current?.focus();
  }, [streaming]);

  /* --- One turn ---------------------------------------------------------- */
  const send = useCallback(
    async (message: string, sessionId?: string) => {
      const id = sessionId ?? session?.sessionId;
      if (!id || streaming) return;

      setStreaming(true);
      setError("");
      setDraft("");

      /* Optimistic: the student's bubble and the tutor's placeholder both go in
         before the request leaves. */
      setTurns((current) => [
        ...current,
        ...(message ? [{ role: "student" as const, content: message, beat: session?.beat ?? "HOOK" }] : []),
        { role: "tutor" as const, content: "", beat: session?.beat ?? "HOOK", pending: true },
      ]);

      try {
        const response = await fetch(`/api/tutor/session/${id}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });

        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? "Jawab nahi aaya.");
        }

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += value;

          /* SSE frames are separated by a blank line and can split across
             reads, so the trailing partial frame stays in the buffer. */
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const event = /^event: (.+)$/m.exec(frame)?.[1];
            const raw = /^data: (.+)$/m.exec(frame)?.[1];
            if (!event || !raw) continue;

            const data = JSON.parse(raw);

            if (event === "text") {
              setTurns((current) => {
                const next = [...current];
                const last = next[next.length - 1];
                if (last?.role === "tutor") {
                  next[next.length - 1] = {
                    ...last,
                    content: last.content + String(data),
                    pending: false,
                  };
                }
                return next;
              });
            }

            if (event === "done") {
              /* Stamp the reply that just streamed with its stored sequence
                 number, so its speaker button works straight away rather than
                 only after a reload. The route addresses a turn by (session,
                 seq) because it reads the text from the row and never from the
                 browser. */
              if (typeof data.tutorSeq === "number") {
                setTurns((current) => {
                  const next = [...current];
                  const last = next[next.length - 1];
                  if (last?.role === "tutor") {
                    next[next.length - 1] = { ...last, seq: data.tutorSeq };
                  }
                  return next;
                });
              }

              setSession((current) =>
                current
                  ? { ...current, beat: data.beat, turnsUsed: data.turnsUsed }
                  : current,
              );

              if (data.intervention === "escalate") setBlocked(data.category ?? "paused");

              /* The concept changed under us, so the header needs refreshing.
                 Cheaper than threading every field through the done event. */
              if (data.conceptAdvanced) {
                const state = await fetch(`/api/tutor/session/${id}`).then((r) => r.json());
                setSession(state);
              }
            }

            if (event === "error") {
              setError(String(data.message ?? "Kuch gadbad hui."));
              setTurns((current) => current.filter((turn) => !turn.pending));
            }
          }
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Kuch gadbad hui.");
        setTurns((current) => current.filter((turn) => !turn.pending));
      } finally {
        setStreaming(false);
      }
    },
    [session, streaming],
  );

  /* --- Render ------------------------------------------------------------ */
  if (paywalled) {
    return <Paywall onUnlocked={() => window.location.reload()} />;
  }

  if (error && !session) {
    return (
      <Panel className="p-6">
        <p style={{ color: text(0.7) }}>{error}</p>
      </Panel>
    );
  }

  const beat = session?.beat ?? "HOOK";
  const done = beat === "DONE" || session?.status === "completed";

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col gap-4">
      <Panel className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: text(0.45) }}>
            {session?.chapter ?? ""}
          </p>
          <h1 className="font-display mt-1 text-xl font-extrabold tracking-[-0.02em]" style={{ color: text() }}>
            {session?.concept?.title ?? session?.topic?.title ?? "Loading…"}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {session && session.conceptCount > 0 && (
            <span className="text-[13px]" style={{ color: text(0.55) }}>
              Concept {session.conceptIndex} / {session.conceptCount}
            </span>
          )}

          <span
            className="rounded-full px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ background: acc(0.14), color: acc() }}
            role="status"
            aria-label={`Abhi: ${BEAT_LABEL[beat]}`}
          >
            {BEAT_LABEL[beat]}
          </span>
        </div>
      </Panel>

      {/* Not <Panel>, which does not forward a ref — and the scroll container
          is the element that has to be scrolled to the bottom on every chunk. */}
      <div
        ref={threadRef}
        /* aria-live="polite" so the reply is announced as it streams, and
           aria-atomic="false" so only the new text is read rather than the
           whole conversation again on every chunk. Without this the tutor is
           completely silent to a screen-reader user: the text lands in the DOM
           and nothing tells them it did. */
        role="log"
        aria-live="polite"
        aria-atomic="false"
        aria-label="Tutor se baat-cheet"
        className="flex-1 space-y-4 overflow-y-auto rounded-2xl p-5"
        style={{ background: text(0.035), border: `1px solid ${text(0.08)}` }}
      >
        {turns.map((turn, index) =>
          turn.role === "student" ? (
            <div key={index} className="flex justify-end">
              <div
                className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-[15px]"
                style={{ background: acc(0.16), color: text(0.9) }}
              >
                {turn.content}
              </div>
            </div>
          ) : (
            <div key={index} className="flex gap-3">
              <div
                className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{ background: acc(0.14), color: acc() }}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </div>

              <div className="max-w-[85%]">
                {turn.pending ? (
                  <div
                    className="flex items-center gap-2 py-1"
                    style={{ color: text(0.45) }}
                    role="status"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span className="text-[13px]">soch raha hoon…</span>
                  </div>
                ) : (
                  <>
                    <TutorMessage body={turn.content} />

                    {/* On demand, and only where there is a stored turn to
                        read. Speaking every reply automatically would multiply
                        the per-student cost for messages most students read
                        faster than a voice can say them — and would add
                        seconds to a turn they are already waiting on. */}
                    {turn.seq !== undefined && session?.sessionId && (
                      <div className="mt-1.5">
                        <SpeakButton sessionId={session.sessionId} seq={turn.seq} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ),
        )}
      </div>

      {blocked && (
        <Panel className="flex items-start gap-3 px-5 py-4">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: text(0.6) }} />
          <p className="text-[14px]" style={{ color: text(0.7) }}>
            Ye session yahin roka gaya hai. Kisi bade se baat karo — hum yahin hain jab tum wapas aao.
          </p>
        </Panel>
      )}

      {/* The handoff. A concept that ends with a dead input is a concept the
          student closes the tab on — and practice is where the teaching turns
          into a mastery score. */}
      {done && !blocked && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="text-[15px]" style={{ color: text(0.85) }}>
            Ye concept ho gaya. Ab kuch sawal karke pakka karte hain.
          </p>

          <Link
            href={`/practice/${topicId}`}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[14px] font-semibold"
            style={{ background: acc(0.16), color: acc() }}
          >
            Practice karo
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Panel>
      )}

      {!blocked && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) void send(draft.trim());
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={streaming || done}
            aria-label={`Jawab likho. ${BEAT_HINT[beat]}`}
            placeholder={done ? "Ye concept poora ho gaya." : BEAT_HINT[beat]}
            className="flex-1 rounded-xl px-4 py-3 text-[15px] outline-none"
            style={{
              background: text(0.04),
              border: `1px solid ${text(0.1)}`,
              color: text(0.9),
            }}
          />
          {/* Renders whatever the consent says — the route returns 403 when
              the voice purpose was not granted, and the button surfaces that
              as a message rather than the screen hiding a feature the parent
              may simply not have enabled yet. */}
          <VoiceButton
            sessionId={session?.sessionId}
            disabled={streaming || done}
            onTranscript={(transcript) => void send(transcript)}
            onDraft={(transcript) => setDraft(transcript)}
          />

          <Button type="submit" disabled={streaming || done || !draft.trim()} className="px-4">
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      )}

      {error && (
        <p className="text-[13px]" role="alert" style={{ color: text(0.6) }}>
          {error}
        </p>
      )}

      {session && (
        <p className="text-center text-[12px]" style={{ color: text(0.38) }}>
          {session.turnsUsed} / {session.limits.maxTurns} turns is concept pe
        </p>
      )}
    </div>
  );
}
