"use client";

import { useEffect, useRef, useState } from "react";

import { acc, acc2, onacc, text } from "@/lib/theme";

const TEST_SECONDS = 5;

/* Clicks per second over a fixed five-second run. */
export function CpsTest() {
  const [clicks, setClicks] = useState(0);
  const [remaining, setRemaining] = useState(TEST_SECONDS);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<number | null>(null);
  const [best, setBest] = useState(0);

  const startedRef = useRef(0);

  useEffect(() => {
    if (!running) return;

    const id = window.setInterval(() => {
      const elapsed = (performance.now() - startedRef.current) / 1000;
      const left = Math.max(0, TEST_SECONDS - elapsed);
      setRemaining(left);

      if (left === 0) {
        setRunning(false);
      }
    }, 50);

    return () => window.clearInterval(id);
  }, [running]);

  /* Score the run once the clock stops. */
  useEffect(() => {
    if (running || remaining > 0) return;

    const cps = clicks / TEST_SECONDS;
    setLast(cps);
    setBest((value) => Math.max(value, cps));
  }, [running, remaining, clicks]);

  const hit = () => {
    if (!running && remaining === TEST_SECONDS) {
      startedRef.current = performance.now();
      setRunning(true);
      setClicks(1);
      return;
    }

    if (running) setClicks((value) => value + 1);
  };

  const reset = () => {
    setClicks(0);
    setRemaining(TEST_SECONDS);
    setRunning(false);
    setLast(null);
  };

  const finished = !running && remaining === 0;

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p
            className="font-display text-[2.2rem] font-extrabold leading-none tracking-[-0.03em]"
            style={{ color: acc() }}
          >
            {clicks}
          </p>
          <p
            className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: text(0.45) }}
          >
            Clicks
          </p>
        </div>

        <div className="text-right">
          <p
            className="font-display text-[1.4rem] font-extrabold leading-none"
            style={{ color: running ? acc2() : text(0.7) }}
          >
            {remaining.toFixed(1)}s
          </p>
          <p className="mt-1 text-[11px]" style={{ color: text(0.45) }}>
            {running ? "Go!" : finished ? "Done" : `${TEST_SECONDS}s run`}
          </p>
        </div>
      </div>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full"
        style={{ background: text(0.1) }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-75 ease-linear"
          style={{
            width: `${(remaining / TEST_SECONDS) * 100}%`,
            background: acc(),
          }}
        />
      </div>

      <button
        type="button"
        onClick={hit}
        disabled={finished}
        className="mt-3 flex h-[210px] w-full items-center justify-center rounded-xl text-center transition-transform active:scale-[0.99] disabled:cursor-default"
        style={{
          background:
            "radial-gradient(120% 90% at 70% 20%, #3a2b60 0%, #221c3c 45%, #0f0d1e 100%)",
        }}
      >
        <span className="px-6">
          <span
            className="font-display block text-[1.5rem] font-extrabold text-white"
          >
            {finished
              ? `${last?.toFixed(1)} clicks / second`
              : running
                ? "Keep clicking!"
                : "Click to start"}
          </span>
          <span
            className="mt-2 block text-[13px]"
            style={{ color: "rgb(255 255 255 / 0.65)" }}
          >
            {finished
              ? "Reset to try again"
              : `As many clicks as you can in ${TEST_SECONDS} seconds.`}
          </span>
        </span>
      </button>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[12px]" style={{ color: text(0.5) }}>
          Best{" "}
          <strong style={{ color: text(0.8) }}>
            {best ? `${best.toFixed(1)} cps` : "—"}
          </strong>
        </p>

        <button
          type="button"
          onClick={reset}
          className="rounded-full px-4 py-1.5 text-[12px] font-bold transition-colors"
          style={{
            background: finished ? acc() : text(0.07),
            color: finished ? onacc() : text(0.6),
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
