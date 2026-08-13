"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gamepad2, X, Zap } from "lucide-react";

import { CpsTest } from "@/components/onboarding/games/CpsTest";
import { StudyTycoon } from "@/components/onboarding/games/StudyTycoon";
import { useStillness } from "@/components/Reveal";
import { acc, onacc, text } from "@/lib/theme";

type Tab = "tycoon" | "cps";

/* Offered while the roadmap builds. Closes itself the moment the build
   finishes, so nobody has to notice the game ended. */
export function PlayWhileYouWait({
  open,
  ready,
  onClose,
}: {
  open: boolean;
  ready: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("tycoon");
  const still = useStillness();

  /* Give the player a beat to see the roadmap landed before it vanishes. */
  useEffect(() => {
    if (!open || !ready) return;
    const id = window.setTimeout(onClose, 900);
    return () => window.clearTimeout(id);
  }, [open, ready, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={still ? undefined : { opacity: 0 }}
        >
          <div
            className="absolute inset-0"
            style={{ background: "rgb(0 0 0 / 0.55)" }}
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Play while you wait"
            className="glass-strong relative flex max-h-[92vh] w-full max-w-[520px] flex-col overflow-hidden rounded-3xl"
            initial={still ? false : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={still ? undefined : { opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="flex items-center justify-between gap-3 border-b px-5 py-4"
              style={{ borderColor: "var(--line)" }}
            >
              <p
                className="flex items-center gap-2 text-[15px] font-bold"
                style={{ color: text() }}
              >
                <Gamepad2 className="h-[18px] w-[18px]" style={{ color: acc() }} />
                Play while you wait
              </p>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
                style={{ color: text(0.6) }}
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4" data-lenis-prevent>
              <div role="tablist" aria-label="Games" className="flex gap-2">
                <TabButton
                  active={tab === "tycoon"}
                  onClick={() => setTab("tycoon")}
                  icon={<span aria-hidden="true">🧠</span>}
                  label="Study Tycoon"
                />
                <TabButton
                  active={tab === "cps"}
                  onClick={() => setTab("cps")}
                  icon={<Zap className="h-3.5 w-3.5" />}
                  label="CPS Test"
                />
              </div>

              <div className="mt-4">
                {tab === "tycoon" ? <StudyTycoon /> : <CpsTest />}
              </div>
            </div>

            <p
              className="border-t px-5 py-3 text-center text-[12.5px]"
              style={{ borderColor: "var(--line)", color: text(0.5) }}
            >
              {ready
                ? "Your roadmap is ready — closing…"
                : "Setting up your roadmap — this closes itself when it's ready."}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors"
      style={{
        background: active ? acc() : text(0.06),
        color: active ? onacc() : text(0.6),
      }}
    >
      {icon}
      {label}
    </button>
  );
}
