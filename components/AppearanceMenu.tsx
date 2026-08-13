"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Palette } from "lucide-react";

import {
  A11Y_STORAGE_KEY,
  A11Y_TOGGLES,
  DEFAULT_A11Y,
  applyA11y,
  readA11y,
  type A11yState,
  type TextSize,
} from "@/lib/a11y";
import {
  DEFAULT_THEME,
  THEMES,
  THEME_IDS,
  acc,
  applyTheme,
  onacc,
  text,
  type ThemeId,
} from "@/lib/theme";
import { useStillness } from "@/components/Reveal";

const TEXT_SIZE_OPTIONS: { id: TextSize; label: string; size: string }[] = [
  { id: "base", label: "A", size: "13px" },
  { id: "lg", label: "A", size: "15px" },
  { id: "xl", label: "A", size: "18px" },
];

/* One popover holding both the theme swatches and the reading/focus
   switches, so the header keeps a single control. */
export function AppearanceMenu() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [a11y, setA11y] = useState<A11yState>(DEFAULT_A11Y);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const still = useStillness();

  /* The blocking script in <head> has already applied the classes to <html>;
     read them back so the two can never disagree. */
  useEffect(() => {
    const current = THEME_IDS.find((id) =>
      document.documentElement.classList.contains(`theme-${id}`),
    );
    if (current) setTheme(current);
    setA11y(readA11y());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const chooseTheme = (id: ThemeId) => {
    applyTheme(id);
    setTheme(id);
  };

  const commitA11y = (next: A11yState) => {
    setA11y(next);
    applyA11y(next);
    persist(A11Y_STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Theme, reading and focus options"
        onClick={() => setOpen((value) => !value)}
        className="glass flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:border-[var(--line-strong)]"
        style={{ color: text(0.85) }}
      >
        <Palette className="h-[17px] w-[17px]" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={still ? false : { opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={still ? undefined : { opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong absolute right-0 z-50 mt-3 w-[288px] max-w-[calc(100vw-2rem)] rounded-3xl p-4"
          >
            <SectionLabel>Theme</SectionLabel>
            <div
              role="radiogroup"
              aria-label="Theme"
              /* Nine themes is more than fits comfortably, so the list
                 scrolls inside the popover. */
              className="max-h-[232px] space-y-0.5 overflow-y-auto pr-1"
              data-lenis-prevent
            >
              {THEMES.map((option) => {
                const active = mounted && option.id === theme;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => chooseTheme(option.id)}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-2.5 py-2 text-left text-[14px] font-semibold transition-colors"
                    style={{
                      color: text(active ? 1 : 0.8),
                      background: active ? acc(0.14) : "transparent",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: option.swatch,
                        border: `1px solid ${text(0.22)}`,
                      }}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: option.dot }}
                      />
                    </span>
                    <span className="flex-1">{option.label}</span>
                    {active && (
                      <Check className="h-4 w-4 shrink-0" style={{ color: acc() }} />
                    )}
                  </button>
                );
              })}
            </div>

            <Divider />
            <SectionLabel>Reading and focus</SectionLabel>

            <div className="space-y-0.5">
              {A11Y_TOGGLES.map((toggle) => {
                const on = mounted && a11y[toggle.key];
                return (
                  <button
                    key={toggle.key}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() =>
                      commitA11y({ ...a11y, [toggle.key]: !a11y[toggle.key] })
                    }
                    className="flex w-full cursor-pointer items-start gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors"
                    style={{ background: on ? acc(0.12) : "transparent" }}
                  >
                    <span
                      aria-hidden="true"
                      className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors"
                      style={{ background: on ? acc() : text(0.2) }}
                    >
                      <span
                        className="absolute top-0.5 h-4 w-4 rounded-full transition-all"
                        style={{
                          background: on ? onacc() : text(0.7),
                          left: on ? "18px" : "2px",
                        }}
                      />
                    </span>
                    <span className="min-w-0">
                      <span
                        className="block text-[14px] font-bold leading-tight"
                        style={{ color: text() }}
                      >
                        {toggle.label}
                      </span>
                      <span
                        className="mt-0.5 block text-[12px] leading-snug"
                        style={{ color: text(0.55) }}
                      >
                        {toggle.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <Divider />
            <SectionLabel>Text size</SectionLabel>

            <div className="flex gap-2">
              {TEXT_SIZE_OPTIONS.map((option) => {
                const active = mounted && a11y.textSize === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Text size ${option.id}`}
                    onClick={() => commitA11y({ ...a11y, textSize: option.id })}
                    className="h-10 flex-1 cursor-pointer rounded-2xl font-bold transition-colors"
                    style={{
                      fontSize: option.size,
                      background: active ? acc() : text(0.07),
                      color: active ? onacc() : text(0.8),
                      border: `1px solid ${active ? acc() : text(0.12)}`,
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => commitA11y(DEFAULT_A11Y)}
              className="mt-3 w-full cursor-pointer rounded-2xl py-2 text-[13px] font-semibold transition-colors"
              style={{ color: text(0.6), background: text(0.05) }}
            >
              Reset reading options
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em]"
      style={{ color: text(0.5) }}
    >
      {children}
    </p>
  );
}

function Divider() {
  return <div className="my-3 h-px" style={{ background: "var(--line)" }} />;
}

function persist(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Private browsing: the choice simply does not persist. */
  }
}
