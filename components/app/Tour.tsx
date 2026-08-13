"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useStillness } from "@/components/Reveal";
import { TOUR_STORAGE_KEY } from "@/lib/study";
import { acc, onacc, text } from "@/lib/theme";

export type TourStep = {
  /* Value of a data-tour attribute on the element to highlight. Omit for a
     step that floats in the middle of the screen. */
  target?: string;
  title: string;
  body: string;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 6;
const CARD_WIDTH = 280;
const GAP = 14;

/* A guided walkthrough that dims the page, rings one element at a time and
   parks a card beside it. Positions are measured on every step and on
   resize, so nothing is hard-coded to a layout. */
export function Tour({ steps }: { steps: TourStep[] }) {
  const still = useStillness();
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);

  /* Only run for someone who has not seen it. */
  useEffect(() => {
    try {
      if (window.localStorage.getItem(TOUR_STORAGE_KEY) !== "1") setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  const finish = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, "1");
    } catch {
      /* Private browsing: the tour will run again next visit. */
    }
  }, []);

  const step = steps[index];

  const measure = useCallback(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }

    const node = document.querySelector<HTMLElement>(
      `[data-tour="${step.target}"]`,
    );

    if (!node) {
      setRect(null);
      return;
    }

    node.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });

    /* Let the scroll settle before reading the box. */
    window.setTimeout(
      () => {
        const box = node.getBoundingClientRect();
        setRect({
          top: box.top,
          left: box.left,
          width: box.width,
          height: box.height,
        });
      },
      still ? 0 : 320,
    );
  }, [step, still]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    return () => window.removeEventListener("resize", onChange);
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!open || !step) return null;

  const last = index === steps.length - 1;
  const card = cardPosition(rect);

  return (
    <div className="fixed inset-0 z-[90]">
      {/* Four panels around the target leave a real hole, so the highlighted
          element stays fully interactive and fully lit. */}
      {rect ? (
        <>
          <Shade style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top - PAD) }} />
          <Shade style={{ top: rect.top + rect.height + PAD, left: 0, right: 0, bottom: 0 }} />
          <Shade
            style={{
              top: rect.top - PAD,
              left: 0,
              width: Math.max(0, rect.left - PAD),
              height: rect.height + PAD * 2,
            }}
          />
          <Shade
            style={{
              top: rect.top - PAD,
              left: rect.left + rect.width + PAD,
              right: 0,
              height: rect.height + PAD * 2,
            }}
          />
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-xl"
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              border: `2px solid ${acc()}`,
              boxShadow: `0 0 0 1px ${acc(0.35)}, 0 0 28px ${acc(0.45)}`,
            }}
            layout={!still}
            transition={{ duration: 0.25 }}
          />
        </>
      ) : (
        <Shade style={{ inset: 0 }} />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          role="dialog"
          aria-modal="true"
          aria-label={step.title}
          className="absolute rounded-2xl p-5"
          style={{
            ...card,
            width: CARD_WIDTH,
            background: "var(--bg)",
            border: `1px solid ${acc(0.55)}`,
            boxShadow: `0 24px 60px -24px rgb(0 0 0 / 0.7), 0 0 0 1px ${acc(0.18)}`,
          }}
          initial={still ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={still ? undefined : { opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.18 }}
        >
          <p
            className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ color: acc() }}
          >
            Step {index + 1} of {steps.length}
          </p>

          <h2
            className="font-display mt-2 text-[16px] font-extrabold tracking-[-0.01em]"
            style={{ color: text() }}
          >
            {step.title}
          </h2>

          <p
            className="mt-2.5 text-[13.5px] leading-[1.55]"
            style={{ color: text(0.7) }}
          >
            {step.body}
          </p>

          <div className="mt-5 flex items-center justify-between gap-3">
            {last ? (
              <button
                type="button"
                onClick={finish}
                className="w-full rounded-xl px-4 py-2.5 text-[14px] font-bold transition-opacity hover:opacity-90"
                style={{ background: acc(), color: onacc() }}
              >
                Start revising →
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={finish}
                  className="text-[13px] font-medium transition-colors"
                  style={{ color: text(0.55) }}
                >
                  Skip tutorial
                </button>
                <button
                  type="button"
                  onClick={() => setIndex((value) => value + 1)}
                  className="rounded-xl px-4 py-2 text-[13.5px] font-bold transition-opacity hover:opacity-90"
                  style={{ background: acc(), color: onacc() }}
                >
                  Next →
                </button>
              </>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Shade({ style }: { style: React.CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className="absolute"
      style={{ background: "rgb(0 0 0 / 0.72)", ...style }}
    />
  );
}

/* Prefer the right of the target, fall back to left, then below — always
   clamped inside the viewport. */
function cardPosition(rect: Rect | null): React.CSSProperties {
  if (typeof window === "undefined") return { top: 80, left: 80 };

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!rect) {
    return {
      top: Math.max(24, vh / 2 - 110),
      left: Math.max(16, vw / 2 - CARD_WIDTH / 2),
    };
  }

  const roomRight = vw - (rect.left + rect.width) - GAP;
  const roomLeft = rect.left - GAP;

  const left =
    roomRight >= CARD_WIDTH + 16
      ? rect.left + rect.width + GAP
      : roomLeft >= CARD_WIDTH + 16
        ? rect.left - CARD_WIDTH - GAP
        : Math.max(16, Math.min(vw - CARD_WIDTH - 16, rect.left));

  const preferred =
    roomRight >= CARD_WIDTH + 16 || roomLeft >= CARD_WIDTH + 16
      ? rect.top
      : rect.top + rect.height + GAP;

  return {
    left,
    top: Math.max(16, Math.min(vh - 240, preferred)),
  };
}
