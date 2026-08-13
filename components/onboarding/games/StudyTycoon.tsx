"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";

import { useStillness } from "@/components/Reveal";
import {
  ACHIEVEMENTS,
  COMBO_MAX,
  GENERATORS,
  affordableCount,
  bulkCost,
  formatMarks,
  nextCombo,
  ratePerSecond,
  unitCost,
  type Owned,
} from "@/lib/tycoon";
import { acc, acc2, onacc, text } from "@/lib/theme";

const BUY_AMOUNTS = [1, 10, 100, "max"] as const;
type BuyAmount = (typeof BUY_AMOUNTS)[number];

type Pop = { id: number; value: number; x: number; y: number };

export function StudyTycoon() {
  const still = useStillness();

  const [marks, setMarks] = useState(0);
  const [lifetime, setLifetime] = useState(0);
  const [taps, setTaps] = useState(0);
  const [owned, setOwned] = useState<Owned>({});
  const [combo, setCombo] = useState(1);
  const [bestCombo, setBestCombo] = useState(1);
  const [buyAmount, setBuyAmount] = useState<BuyAmount>(1);
  const [muted, setMuted] = useState(true);
  const [pops, setPops] = useState<Pop[]>([]);

  const lastTapRef = useRef(0);
  const popIdRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);

  const perSecond = ratePerSecond(owned);
  const perTap = Math.round(1 * combo * 100) / 100;

  /* Passive income, ticked ten times a second so the counter feels live. */
  useEffect(() => {
    if (perSecond <= 0) return;

    const id = window.setInterval(() => {
      const gain = perSecond / 10;
      setMarks((value) => value + gain);
      setLifetime((value) => value + gain);
    }, 100);

    return () => window.clearInterval(id);
  }, [perSecond]);

  /* Combo decays once you stop tapping. */
  useEffect(() => {
    if (combo <= 1) return;

    const id = window.setInterval(() => {
      if (performance.now() - lastTapRef.current > 500) {
        setCombo((value) => Math.max(1, value - 0.25));
      }
    }, 220);

    return () => window.clearInterval(id);
  }, [combo]);

  const blip = useCallback(() => {
    if (muted) return;

    try {
      audioRef.current ??= new AudioContext();
      const ctx = audioRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.value = 420 + Math.random() * 160;
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);

      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      /* No audio device, or the context was blocked — the game is silent. */
    }
  }, [muted]);

  const tap = (event: React.MouseEvent<HTMLButtonElement>) => {
    const now = performance.now();
    const boosted = nextCombo(combo, now - lastTapRef.current);
    lastTapRef.current = now;

    const gain = boosted;
    setCombo(boosted);
    setBestCombo((value) => Math.max(value, boosted));
    setMarks((value) => value + gain);
    setLifetime((value) => value + gain);
    setTaps((value) => value + 1);
    blip();

    if (!still) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const pop: Pop = {
        id: popIdRef.current++,
        value: gain,
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
      setPops((current) => [...current.slice(-8), pop]);
      window.setTimeout(
        () => setPops((current) => current.filter((p) => p.id !== pop.id)),
        800,
      );
    }
  };

  const buy = (generatorId: string) => {
    const generator = GENERATORS.find((g) => g.id === generatorId);
    if (!generator) return;

    const have = owned[generatorId] ?? 0;
    const wanted =
      buyAmount === "max"
        ? affordableCount(generator, have, marks)
        : Math.min(buyAmount, affordableCount(generator, have, marks));

    if (wanted <= 0) return;

    setMarks((value) => value - bulkCost(generator, have, wanted));
    setOwned((current) => ({ ...current, [generatorId]: have + wanted }));
  };

  const unlocked = ACHIEVEMENTS.filter((achievement) =>
    achievement.test({ lifetime, taps, perSecond, owned, bestCombo }),
  ).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ background: text(0.07), color: text(0.6) }}
        >
          🏅 {unlocked}/{ACHIEVEMENTS.length}
        </span>

        <button
          type="button"
          onClick={() => setMuted((value) => !value)}
          aria-label={muted ? "Unmute" : "Mute"}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={{ background: text(0.07), color: text(0.6) }}
        >
          {muted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <p
            className="font-display text-[2.2rem] font-extrabold leading-none tracking-[-0.03em]"
            style={{ color: acc() }}
          >
            {formatMarks(marks)}
          </p>
          <p
            className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: text(0.45) }}
          >
            Marks
          </p>
        </div>

        <div className="text-right">
          <p
            className="font-display text-[1.1rem] font-extrabold leading-none"
            style={{ color: acc() }}
          >
            {formatMarks(perSecond)}/s
          </p>
          <p className="mt-1 text-[11px]" style={{ color: text(0.45) }}>
            +{perTap} / tap
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={tap}
        aria-label="Tap the brain to earn marks"
        className="relative mt-3 flex h-[210px] w-full items-center justify-center overflow-hidden rounded-xl"
        style={{
          background:
            "radial-gradient(120% 90% at 30% 20%, #2b3f6b 0%, #1b2440 45%, #0d1224 100%)",
        }}
      >
        <Starfield />

        <motion.span
          className="relative flex h-[128px] w-[128px] items-center justify-center rounded-full text-[54px]"
          style={{
            background: `radial-gradient(circle at 35% 30%, ${acc(0.95)}, ${acc2(0.85)} 70%)`,
            boxShadow: `0 0 60px ${acc(0.55)}`,
          }}
          animate={still ? undefined : { scale: [1, 1.04, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          whileTap={still ? undefined : { scale: 0.92 }}
        >
          🧠
        </motion.span>

        <AnimatePresence>
          {pops.map((pop) => (
            <motion.span
              key={pop.id}
              className="pointer-events-none absolute font-display text-[15px] font-extrabold"
              style={{ left: pop.x, top: pop.y, color: "#fff" }}
              initial={{ opacity: 1, y: 0, scale: 0.8 }}
              animate={{ opacity: 0, y: -52, scale: 1.15 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              +{pop.value.toFixed(2).replace(/\.00$/, "")}
            </motion.span>
          ))}
        </AnimatePresence>

        {combo > 1 && (
          <span
            className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ background: acc2(0.25), color: "#fff" }}
          >
            ×{combo.toFixed(2).replace(/0$/, "")} combo
          </span>
        )}

        <p
          className="absolute inset-x-0 bottom-3 text-center text-[12px] font-semibold"
          style={{ color: "rgb(255 255 255 / 0.8)" }}
        >
          {combo >= COMBO_MAX
            ? "Max combo — keep going!"
            : "Tap the brain — fast taps build a combo!"}
        </p>
      </button>

      <div className="mt-3 flex items-center gap-2">
        <span
          className="text-[11px] font-bold uppercase tracking-[0.14em]"
          style={{ color: text(0.45) }}
        >
          Buy
        </span>
        {BUY_AMOUNTS.map((amount) => {
          const active = buyAmount === amount;
          return (
            <button
              key={String(amount)}
              type="button"
              aria-pressed={active}
              onClick={() => setBuyAmount(amount)}
              className="rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors"
              style={{
                background: active ? acc() : text(0.07),
                color: active ? onacc() : text(0.6),
              }}
            >
              {amount === "max" ? "Max" : `×${amount}`}
            </button>
          );
        })}
      </div>

      <ul className="mt-3 space-y-2">
        {GENERATORS.map((generator) => {
          const have = owned[generator.id] ?? 0;
          const canAfford = marks >= unitCost(generator, have);
          const wanted =
            buyAmount === "max"
              ? affordableCount(generator, have, marks)
              : buyAmount;
          const price = bulkCost(generator, have, Math.max(1, wanted));

          return (
            <li key={generator.id}>
              <button
                type="button"
                onClick={() => buy(generator.id)}
                disabled={!canAfford}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-45"
                style={{
                  background: text(0.04),
                  border: `1px solid ${canAfford ? acc(0.35) : "var(--line)"}`,
                }}
              >
                <span aria-hidden="true" className="text-[19px]">
                  {generator.glyph}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[13.5px] font-bold"
                    style={{ color: text() }}
                  >
                    {generator.name}
                    {have > 0 && (
                      <span style={{ color: text(0.45) }}> · {have}</span>
                    )}
                  </span>
                  <span
                    className="block truncate text-[11.5px]"
                    style={{ color: text(0.45) }}
                  >
                    {generator.rate}/s each · {generator.blurb}
                  </span>
                </span>

                <span
                  className="shrink-0 text-right text-[12px] font-bold"
                  style={{ color: canAfford ? acc() : text(0.4) }}
                >
                  {formatMarks(price)}
                  <span
                    className="block text-[10px] font-medium"
                    style={{ color: text(0.4) }}
                  >
                    {buyAmount === "max" ? `×${Math.max(1, wanted)}` : `×${wanted}`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-center text-[12px]" style={{ color: text(0.45) }}>
        Lifetime <strong style={{ color: text(0.7) }}>{formatMarks(lifetime)}</strong> ·{" "}
        {taps.toLocaleString()} taps · best combo ×{bestCombo.toFixed(2).replace(/0$/, "")}
      </p>
    </div>
  );
}

/* A cheap deterministic starfield — no images, no per-frame work. */
function Starfield() {
  const stars = Array.from({ length: 46 }, (_, index) => {
    /* Deterministic pseudo-random so the field never reshuffles on rerender. */
    const a = Math.sin(index * 12.9898) * 43758.5453;
    const b = Math.sin(index * 78.233) * 12345.6789;
    return {
      left: `${Math.abs(a % 1) * 100}%`,
      top: `${Math.abs(b % 1) * 100}%`,
      size: (index % 3) + 1,
      opacity: 0.25 + Math.abs(a % 1) * 0.6,
    };
  });

  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {stars.map((star, index) => (
        <span
          key={index}
          className="absolute rounded-full bg-white"
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
          }}
        />
      ))}
    </span>
  );
}
