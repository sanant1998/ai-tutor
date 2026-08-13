"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Pause,
  Play,
  Presentation,
  RotateCcw,
} from "lucide-react";

import { Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { useStillness } from "@/components/Reveal";
import type { Topic } from "@/lib/study";
import { acc, text } from "@/lib/theme";

type Step = { label: string; say: string };

type Explainer = {
  headline: string;
  narration: Step[];
  diagram: string;
};

/* Diagram plus narration for one topic. The audio is one file for the whole
   script, so step timing is estimated from where the player has got to rather
   than from real word timings — good enough to keep the caption with the
   voice, and it costs nothing extra. */
export function TopicExplainer({
  topic,
  boardId,
  classLevel,
}: {
  topic: Topic;
  boardId: string | null;
  classLevel: number | null;
}) {
  const [explainer, setExplainer] = useState<Explainer | null>(null);
  const [step, setStep] = useState(0);
  const [audioUrl, setAudioUrl] = useState("");
  const [playing, setPlaying] = useState(false);

  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");

  const audio = useRef<HTMLAudioElement | null>(null);
  const still = useStillness();

  /* A new topic invalidates everything on screen. */
  useEffect(() => {
    setExplainer(null);
    setAudioUrl("");
    setStep(0);
    setPlaying(false);
    setError("");
    audio.current?.pause();
  }, [topic.id]);

  const build = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId,
          classLevel,
          subjectId: topic.subjectId,
          unitId: topic.unitId,
          topicId: topic.id,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Could not build the explainer.");
        return;
      }

      setExplainer(payload as Explainer);
      setStep(0);
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const speak = async () => {
    if (audioUrl) {
      void audio.current?.play();
      return;
    }

    setSpeaking(true);
    setError("");

    try {
      const response = await fetch("/api/explain/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: topic.id, boardId: boardId ?? "" }),
      });

      /* The route falls back to sending the mp3 itself when storage is not
         set up, so accept either shape. */
      const type = response.headers.get("Content-Type") ?? "";

      if (!response.ok) {
        const payload = type.includes("json")
          ? await response.json()
          : { error: "Could not generate the audio." };
        setError(payload.error ?? "Could not generate the audio.");
        return;
      }

      const url = type.includes("json")
        ? ((await response.json()).url as string)
        : URL.createObjectURL(await response.blob());

      setAudioUrl(url);
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setSpeaking(false);
    }
  };

  /* Start playing as soon as a URL arrives, since the student asked for it. */
  useEffect(() => {
    if (audioUrl) void audio.current?.play();
  }, [audioUrl]);

  const onTimeUpdate = () => {
    const element = audio.current;
    if (!element?.duration || !explainer) return;

    /* Weight each step by how much there is to say in it, so a long step holds
       the caption longer than a short one. */
    const lengths = explainer.narration.map((entry) => entry.say.length);
    const total = lengths.reduce((sum, value) => sum + value, 0) || 1;
    const played = (element.currentTime / element.duration) * total;

    let running = 0;
    for (let index = 0; index < lengths.length; index += 1) {
      running += lengths[index];
      if (played <= running) {
        setStep(index);
        return;
      }
    }
    setStep(lengths.length - 1);
  };

  return (
    <Panel className="mt-5 p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p
            className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: acc() }}
          >
            <Presentation className="mr-1.5 inline h-3.5 w-3.5" />
            Explain it to me
          </p>
          <p className="mt-2 text-[14px]" style={{ color: text(0.6) }}>
            A diagram, walked through out loud.
          </p>
        </div>

        {explainer && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={speaking}
              onClick={() => {
                if (playing) {
                  audio.current?.pause();
                } else {
                  void speak();
                }
              }}
            >
              {speaking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {speaking ? "Recording…" : playing ? "Pause" : "Listen"}
            </Button>

            <Button
              variant="glass"
              size="sm"
              onClick={() => {
                setExplainer(null);
                setAudioUrl("");
                void build();
              }}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div
          className="mt-5 flex items-start gap-3 rounded-xl p-4"
          style={{ background: text(0.04), border: `1px solid ${text(0.1)}` }}
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: acc() }}
          />
          <p className="text-[14px] leading-[1.6]" style={{ color: text(0.8) }}>
            {error}
          </p>
        </div>
      )}

      {!explainer && !loading && (
        <Button className="mt-5" onClick={build}>
          <Presentation className="h-[18px] w-[18px]" />
          {error ? "Try again" : "Explain this topic"}
        </Button>
      )}

      {loading && (
        <div className="mt-8 flex flex-col items-center py-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: acc() }} />
          <p className="mt-4 text-[14.5px]" style={{ color: text(0.6) }}>
            Drawing the diagram for {topic.name}…
          </p>
        </div>
      )}

      {explainer && (
        <>
          <p
            className="mt-5 text-[16px] font-bold leading-[1.5]"
            style={{ color: text() }}
          >
            {explainer.headline}
          </p>

          {explainer.diagram ? (
            <div
              className="mt-5 overflow-x-auto rounded-2xl p-4"
              style={{
                background: text(0.03),
                border: `1px solid ${text(0.08)}`,
                color: text(0.75),
              }}
              /* Sanitised server-side by lib/ai/svg.ts, which drops every tag
                 and attribute outside a strict allowlist. */
              dangerouslySetInnerHTML={{ __html: explainer.diagram }}
            />
          ) : (
            <p className="mt-5 text-[13.5px] italic" style={{ color: text(0.45) }}>
              The diagram for this topic did not come out usable — the walkthrough
              below still stands on its own.
            </p>
          )}

          <ol className="mt-6 space-y-2">
            {explainer.narration.map((entry, index) => {
              const active = index === step;

              return (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => setStep(index)}
                    className="flex w-full gap-3 rounded-xl px-4 py-3 text-left"
                    style={{
                      background: active ? acc(0.1) : "transparent",
                      border: `1px solid ${active ? acc(0.28) : "transparent"}`,
                      transition: still ? undefined : "background-color 250ms",
                    }}
                  >
                    <span
                      className="mt-0.5 shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.12em]"
                      style={{ color: active ? acc() : text(0.35) }}
                    >
                      {entry.label}
                    </span>
                    <span
                      className="text-[14.5px] leading-[1.65]"
                      style={{ color: text(active ? 0.9 : 0.55) }}
                    >
                      {entry.say}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <audio
            ref={audio}
            src={audioUrl || undefined}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={onTimeUpdate}
            className="mt-5 w-full"
            controls={Boolean(audioUrl)}
          />

          <p className="mt-4 text-[12.5px] italic" style={{ color: text(0.45) }}>
            AI-written explanation and diagram. Check anything that contradicts
            your textbook or teacher before you rely on it in the exam.
          </p>
        </>
      )}
    </Panel>
  );
}
