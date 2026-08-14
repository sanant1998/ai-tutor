"use client";

/* Ask the question out loud.
 *
 * ---------------------------------------------------------------------------
 * WHY A LOW-CONFIDENCE TRANSCRIPT IS SHOWN INSTEAD OF SENT
 *
 * Speech recognition on Hinglish is imperfect and will stay imperfect. The
 * failure that matters is not a missed word — it is the tutor confidently
 * answering a question the student did not ask, which wastes a turn, confuses
 * the student, and teaches them the feature does not work.
 *
 * So below the confidence floor the transcript appears in the input box for
 * the student to fix, and above it the message is sent. One extra tap on the
 * bad cases is a much better trade than a wrong answer on any of them.
 *
 * ---------------------------------------------------------------------------
 * PERMISSION IS ASKED AT THE MOMENT IT IS USED
 *
 * The browser's microphone prompt is requested on the first tap, not on mount.
 * A page that asks for the microphone before the student has expressed any
 * interest in speaking gets denied, and a denied permission is sticky. */

import { useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";

import { text } from "@/lib/theme";

type Props = {
  sessionId?: string;
  /* Called with a transcript confident enough to send as-is. */
  onTranscript: (transcript: string) => void;
  /* Called with one that needs the student's eyes first. */
  onDraft: (transcript: string) => void;
  disabled?: boolean;
};

/* Thirty seconds. A spoken maths question is under ten, and past that it is a
   student leaning on the button — which costs transcription money and adds
   latency to a turn they are waiting on. */
const MAX_MS = 30000;

export function VoiceButton({ sessionId, onTranscript, onDraft, disabled }: Props) {
  const [state, setState] = useState<"idle" | "recording" | "sending">("idle");
  const [error, setError] = useState("");

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    recorder.current?.stop();
    /* Release the microphone immediately. A tab that keeps the recording
       indicator lit after the student has finished speaking is the fastest way
       to have the permission revoked. */
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
  };

  const start = async () => {
    setError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser has no microphone support. Type your question instead.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone permission was refused. Turn it on in your browser settings.");
      return;
    }

    chunks.current = [];

    const media = new MediaRecorder(stream);
    recorder.current = media;

    media.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };

    media.onstop = async () => {
      setState("sending");

      const blob = new Blob(chunks.current, { type: media.mimeType || "audio/webm" });

      /* Nothing was captured — a tap rather than a hold. Not an error worth
         showing. */
      if (blob.size < 1000) {
        setState("idle");
        return;
      }

      try {
        const form = new FormData();
        form.append("audio", blob, "question.webm");
        if (sessionId) form.append("sessionId", sessionId);

        const response = await fetch("/api/tutor/voice", { method: "POST", body: form });
        const payload = await response.json();

        if (!response.ok) {
          setError(payload.error ?? "That could not be understood.");
          return;
        }

        if (payload.confirm) onDraft(payload.transcript);
        else onTranscript(payload.transcript);
      } catch {
        setError("Network problem. Type your question instead.");
      } finally {
        setState("idle");
      }
    };

    media.start();
    setState("recording");

    timer.current = setTimeout(stop, MAX_MS);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => (state === "recording" ? stop() : void start())}
        disabled={disabled || state === "sending"}
        aria-label={state === "recording" ? "Stop recording" : "Ask out loud"}
        className="flex h-11 w-11 items-center justify-center rounded-xl transition-opacity disabled:opacity-50"
        style={{
          background: state === "recording" ? "#dc262622" : text(0.05),
          border: `1px solid ${state === "recording" ? "#dc2626" : text(0.1)}`,
          color: state === "recording" ? "#dc2626" : text(0.7),
        }}
      >
        {state === "sending" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === "recording" ? (
          <Square className="h-3.5 w-3.5 fill-current" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>

      {error && (
        <span className="max-w-[200px] text-right text-[11px]" style={{ color: text(0.55) }}>
          {error}
        </span>
      )}
    </div>
  );
}
