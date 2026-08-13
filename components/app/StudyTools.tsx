"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Accessibility,
  Gamepad2,
  MessageCircle,
  MoreHorizontal,
  Music4,
  Timer,
  X,
} from "lucide-react";

import { PlayWhileYouWait } from "@/components/onboarding/games/PlayWhileYouWait";
import { useStillness } from "@/components/Reveal";
import { acc, onacc, text } from "@/lib/theme";

const FOCUS_MINUTES = 25;

/* The floating tools button: Pomodoro, break arcade, tutor, focus music and
   reading options. The arcade unlocks once a focus block is finished, which
   is the reward the tour promises. */
export function StudyTools() {
  const still = useStillness();
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(FOCUS_MINUTES * 60);
  const [running, setRunning] = useState(false);
  const [arcadeUnlocked, setArcadeUnlocked] = useState(false);
  const [arcadeOpen, setArcadeOpen] = useState(false);
  const [musicOn, setMusicOn] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!running) return;

    const id = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          setRunning(false);
          setArcadeUnlocked(true);
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <>
      <div ref={wrapRef} className="fixed bottom-6 right-6 z-50">
        <AnimatePresence>
          {open && (
            <motion.div
              className="absolute bottom-14 right-0 w-[278px] rounded-2xl p-4"
              style={{
                background: "var(--bg)",
                border: `1px solid ${text(0.12)}`,
                boxShadow: "0 24px 60px -24px rgb(0 0 0 / 0.6)",
              }}
              initial={still ? false : { opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={still ? undefined : { opacity: 0, y: 10, scale: 0.97 }}
              transition={{ duration: 0.18 }}
            >
              <div className="flex items-center justify-between">
                <p
                  className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]"
                  style={{ color: text(0.45) }}
                >
                  Study tools
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close study tools"
                  style={{ color: text(0.5) }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div
                className="mt-3 rounded-xl p-3"
                style={{ background: text(0.05) }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="flex items-center gap-2 text-[13px] font-bold"
                    style={{ color: text(0.85) }}
                  >
                    <Timer className="h-4 w-4" style={{ color: acc() }} />
                    Focus block
                  </span>
                  <span
                    className="font-mono text-[15px] font-bold"
                    style={{ color: acc() }}
                  >
                    {minutes}:{String(seconds).padStart(2, "0")}
                  </span>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRunning((value) => !value)}
                    className="flex-1 rounded-lg py-2 text-[12.5px] font-bold"
                    style={{ background: acc(), color: onacc() }}
                  >
                    {running ? "Pause" : remaining === 0 ? "Done" : "Start"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRunning(false);
                      setRemaining(FOCUS_MINUTES * 60);
                    }}
                    className="rounded-lg px-3 py-2 text-[12.5px] font-bold"
                    style={{ background: text(0.07), color: text(0.7) }}
                  >
                    Reset
                  </button>
                </div>
              </div>

              <ul className="mt-2 space-y-1">
                <ToolRow
                  icon={<Gamepad2 className="h-4 w-4" />}
                  label="Break arcade"
                  hint={arcadeUnlocked ? "Unlocked" : "Finish a focus block"}
                  disabled={!arcadeUnlocked}
                  onClick={() => {
                    setArcadeOpen(true);
                    setOpen(false);
                  }}
                />
                <ToolRow
                  icon={<Music4 className="h-4 w-4" />}
                  label="Focus music"
                  hint={musicOn ? "Playing" : "Off"}
                  onClick={() => setMusicOn((value) => !value)}
                />
                <ToolRow
                  icon={<MessageCircle className="h-4 w-4" />}
                  label="AI tutor"
                  hint="Ask anything"
                  onClick={() => setOpen(false)}
                />
                <ToolRow
                  icon={<Accessibility className="h-4 w-4" />}
                  label="Reading options"
                  hint="Font, spacing, calm"
                  onClick={() => setOpen(false)}
                />
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          data-tour="tools"
          onClick={() => setOpen((value) => !value)}
          aria-label="Study tools"
          aria-expanded={open}
          className="flex h-11 w-11 items-center justify-center rounded-full transition-transform hover:-translate-y-0.5"
          style={{
            background: text(0.08),
            border: `1px solid ${text(0.14)}`,
            color: text(0.75),
          }}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>

      <PlayWhileYouWait
        open={arcadeOpen}
        ready={false}
        onClose={() => setArcadeOpen(false)}
      />
    </>
  );
}

function ToolRow({
  icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors disabled:opacity-45"
        style={{ color: text(0.85) }}
      >
        <span style={{ color: acc() }}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold">{label}</span>
          <span className="block text-[11.5px]" style={{ color: text(0.45) }}>
            {hint}
          </span>
        </span>
      </button>
    </li>
  );
}
