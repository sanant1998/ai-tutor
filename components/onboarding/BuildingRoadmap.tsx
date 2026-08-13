"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Gamepad2, Loader2 } from "lucide-react";

import { PlayWhileYouWait } from "@/components/onboarding/games/PlayWhileYouWait";
import { useStillness } from "@/components/Reveal";
import { GlassCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { acc, text } from "@/lib/theme";

/* Stage boundaries as a fraction of the run. */
const STAGES = [
  { at: 0, label: "Reading your specification" },
  { at: 0.22, label: "Ordering topics by exam date" },
  { at: 0.48, label: "Pacing your week" },
  { at: 0.74, label: "Scheduling spaced recall" },
] as const;

/* How long the simulated build takes. Replace this with the real job's
   completion signal once roadmap generation runs server-side — the game
   modal and the bar both read from the same run. */
export const BUILD_DURATION_MS = 18_000;

/* The game is offered a moment in, so a fast build never flashes a modal. */
const OFFER_GAME_AFTER_MS = 1_800;

export function BuildingRoadmap({ onDone }: { onDone: () => void }) {
  const still = useStillness();
  const [progress, setProgress] = useState(0);
  const [gameOpen, setGameOpen] = useState(false);
  const [offerGame, setOfferGame] = useState(false);

  const ready = progress >= 1;

  useEffect(() => {
    const duration = still ? 600 : BUILD_DURATION_MS;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      /* Ease out, so it moves quickly then settles — the shape people read
         as "working" rather than "stuck". */
      const linear = Math.min((now - start) / duration, 1);
      setProgress(1 - Math.pow(1 - linear, 2));

      if (linear < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [still]);

  useEffect(() => {
    if (still) return;
    const id = window.setTimeout(() => {
      setOfferGame(true);
      setGameOpen(true);
    }, OFFER_GAME_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [still]);

  /* Hand off once the run finishes and the modal has closed itself. */
  useEffect(() => {
    if (!ready || gameOpen) return;
    const id = window.setTimeout(onDone, still ? 0 : 420);
    return () => window.clearTimeout(id);
  }, [ready, gameOpen, onDone, still]);

  const percent = Math.round(progress * 100);

  return (
    <div className="py-6">
      <h1
        className="font-display text-[2.2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.7rem]"
        style={{ color: text() }}
      >
        Building your roadmap…
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-[1.6]" style={{ color: text(0.6) }}>
        Mapping every topic on your specification and spreading it across the
        days you said you&apos;d study.
      </p>

      <GlassCard className="mt-8 max-w-xl p-6 sm:p-7">
        <div className="flex items-baseline justify-between">
          <p
            className="text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ color: text(0.5) }}
          >
            Progress
          </p>
          <p
            className="font-display text-[1.3rem] font-extrabold leading-none"
            style={{ color: acc() }}
            aria-hidden="true"
          >
            {percent}%
          </p>
        </div>

        <div
          className="mt-4 h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Building your roadmap"
          style={{ background: text(0.1) }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${percent}%`,
              background: `linear-gradient(90deg, ${acc(0.7)}, ${acc()})`,
            }}
          />
        </div>

        <ul className="mt-6 space-y-3">
          {STAGES.map((stage, index) => {
            const next = STAGES[index + 1];
            const done = next ? progress >= next.at : ready;
            const active = progress >= stage.at && !done;

            return (
              <li key={stage.label} className="flex items-center gap-3">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: done ? acc() : active ? acc(0.16) : text(0.07),
                    color: done ? "var(--onacc)" : acc(),
                  }}
                >
                  {done ? (
                    <Check className="h-3 w-3" strokeWidth={3.5} />
                  ) : active ? (
                    <Spinner still={still} />
                  ) : null}
                </span>

                <span
                  className="text-[14.5px]"
                  style={{
                    color: done || active ? text(0.88) : text(0.42),
                    fontWeight: active ? 700 : 400,
                  }}
                >
                  {stage.label}
                </span>
              </li>
            );
          })}
        </ul>

        {offerGame && !gameOpen && !ready && (
          <div className="mt-6">
            <Button variant="glass" onClick={() => setGameOpen(true)}>
              <Gamepad2 className="h-[18px] w-[18px]" />
              Play while you wait
            </Button>
          </div>
        )}
      </GlassCard>

      <PlayWhileYouWait
        open={gameOpen}
        ready={ready}
        onClose={() => setGameOpen(false)}
      />
    </div>
  );
}

function Spinner({ still }: { still: boolean }) {
  if (still) return <Loader2 className="h-3 w-3" />;

  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      className="flex"
    >
      <Loader2 className="h-3 w-3" />
    </motion.span>
  );
}
