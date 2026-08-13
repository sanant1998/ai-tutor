"use client";

/* "Padho zor se."
 *
 * ---------------------------------------------------------------------------
 * ONE BUTTON PER MESSAGE, AND NOTHING AUTOMATIC
 *
 * The obvious design speaks every reply as it arrives. It is easier to build
 * and worse on three counts that are all measured on /admin/health: it
 * multiplies the per-student cost, it adds seconds to a turn the student is
 * already waiting on, and most replies are three lines a student reads faster
 * than a voice can say them.
 *
 * Speech earns its place on a worked example and on a reteach — the messages a
 * student reads twice. So it is a button on those messages, and they press it.
 *
 * ---------------------------------------------------------------------------
 * THE 403 IS A MESSAGE, NOT A HIDDEN BUTTON
 *
 * Voice needs its own parental consent. Hiding the button when it has not been
 * given would leave a student who wants it with no idea it exists or how to
 * ask. So the button is always there and the refusal explains itself. */

import { useRef, useState } from "react";
import { Loader2, Volume2, VolumeX } from "lucide-react";

import { text } from "@/lib/theme";

export function SpeakButton({
  sessionId,
  seq,
}: {
  sessionId: string;
  /* Which stored turn to read. Deliberately not the text: the route reads it
     from the row, so this cannot become a way to have the provider say
     anything on our bill. */
  seq: number;
}) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);

  const stop = () => {
    audio.current?.pause();
    audio.current = null;
    setState("idle");
  };

  const play = async () => {
    if (state === "playing") {
      stop();
      return;
    }

    setState("loading");
    setError("");

    try {
      const response = await fetch("/api/tutor/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, seq }),
      });

      /* The route may answer with a signed URL, or with the audio inline when
         it could not be cached. Both are playable; only the shape differs. */
      const type = response.headers.get("content-type") ?? "";

      if (!response.ok) {
        const payload = type.includes("json")
          ? await response.json().catch(() => ({}))
          : {};
        setError(payload.error ?? "Awaaz nahi chali.");
        setState("idle");
        return;
      }

      const url = type.includes("json")
        ? (await response.json()).url
        : URL.createObjectURL(await response.blob());

      if (!url) {
        setError("Awaaz nahi mili.");
        setState("idle");
        return;
      }

      const element = new Audio(url);
      audio.current = element;

      element.onended = () => setState("idle");
      element.onerror = () => {
        setError("Chal nahi paayi.");
        setState("idle");
      };

      await element.play();
      setState("playing");
    } catch {
      setError("Network problem.");
      setState("idle");
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void play()}
        disabled={state === "loading"}
        aria-label={state === "playing" ? "Awaaz band karo" : "Zor se padho"}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg transition-opacity disabled:opacity-50"
        style={{ color: text(0.45) }}
      >
        {state === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : state === "playing" ? (
          <VolumeX className="h-3.5 w-3.5" />
        ) : (
          <Volume2 className="h-3.5 w-3.5" />
        )}
      </button>

      {error && (
        <span className="text-[11px]" style={{ color: text(0.5) }}>
          {error}
        </span>
      )}
    </span>
  );
}
