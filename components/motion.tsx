"use client";

import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";

import { useStillness } from "@/components/Reveal";
import { cn } from "@/lib/utils";
import { acc, acc2, acc3, text } from "@/lib/theme";

/* ---------------------------------------------------------------------------
   Aurora
   Three slowly drifting colour blooms. This is the moving version of the
   static Mesh, used where the background deserves to feel alive — the hero
   and the closing call to action.
   --------------------------------------------------------------------------- */
export function Aurora({ className }: { className?: string }) {
  const still = useStillness();

  const blooms = [
    {
      color: acc(0.55),
      size: "44rem",
      from: { x: "-12%", y: "-18%" },
      drift: { x: ["-12%", "6%", "-12%"], y: ["-18%", "-4%", "-18%"] },
      duration: 26,
    },
    {
      color: acc2(0.45),
      size: "38rem",
      from: { x: "62%", y: "-10%" },
      drift: { x: ["62%", "48%", "62%"], y: ["-10%", "8%", "-10%"] },
      duration: 32,
    },
    {
      color: acc3(0.3),
      size: "34rem",
      from: { x: "28%", y: "40%" },
      drift: { x: ["28%", "44%", "28%"], y: ["40%", "26%", "40%"] },
      duration: 38,
    },
  ];

  return (
    <div
      aria-hidden="true"
      className={cn("mesh pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={{ opacity: "var(--mesh-opacity)" }}
    >
      {blooms.map((bloom, index) => (
        <motion.div
          key={index}
          className="absolute rounded-full"
          style={{
            width: bloom.size,
            height: bloom.size,
            background: `radial-gradient(circle at center, ${bloom.color}, transparent 68%)`,
            filter: "blur(70px)",
            left: bloom.from.x,
            top: bloom.from.y,
          }}
          animate={still ? undefined : { x: bloom.drift.x, y: bloom.drift.y }}
          transition={{
            duration: bloom.duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Spotlight
   A radial highlight that follows the pointer across a card. Pure CSS
   variables driven by motion values, so it never re-renders React.
   --------------------------------------------------------------------------- */
export function Spotlight({
  children,
  className,
  radius = 320,
  tone = "acc",
}: {
  children: React.ReactNode;
  className?: string;
  radius?: number;
  tone?: "acc" | "acc2" | "acc3";
}) {
  const still = useStillness();
  const mouseX = useMotionValue(-9999);
  const mouseY = useMotionValue(-9999);
  const [hovered, setHovered] = useState(false);

  const colour = tone === "acc" ? acc(0.16) : tone === "acc2" ? acc2(0.16) : acc3(0.16);
  const background = useMotionTemplate`radial-gradient(${radius}px circle at ${mouseX}px ${mouseY}px, ${colour}, transparent 72%)`;

  if (still) return <div className={className}>{children}</div>;

  return (
    <div
      className={cn("group relative", className)}
      onMouseMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        mouseX.set(event.clientX - bounds.left);
        mouseY.set(event.clientY - bounds.top);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 rounded-3xl transition-opacity duration-300"
        style={{ background, opacity: hovered ? 1 : 0 }}
      />
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   BorderBeam
   A conic-gradient ring that rotates around a card's edge, masked so only
   the border shows. Used sparingly — the featured plan and the hero panel.
   --------------------------------------------------------------------------- */
export function BorderBeam({
  duration = 9,
  className,
}: {
  duration?: number;
  className?: string;
}) {
  const still = useStillness();
  const angle = useMotionValue(0);

  /* The gradient's angle is animated, not the element's transform. Rotating
     the element would rotate its mask too, which turns the ring into a
     diagonal streak on anything that is not square. */
  useEffect(() => {
    if (still) return;
    const controls = animate(angle, 360, {
      duration,
      repeat: Infinity,
      ease: "linear",
    });
    return () => controls.stop();
  }, [angle, duration, still]);

  const background = useMotionTemplate`conic-gradient(from ${angle}deg, transparent 0deg, ${acc(0.85)} 40deg, ${acc2(0.85)} 75deg, transparent 130deg)`;

  if (still) return null;

  return (
    <motion.div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit]",
        className,
      )}
      style={{
        background,
        padding: 1,
        WebkitMask:
          "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
        WebkitMaskComposite: "xor",
        mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
        maskComposite: "exclude",
      }}
    />
  );
}

/* ---------------------------------------------------------------------------
   CountUp
   Animates a numeric value once, when it first scrolls into view. Non-numeric
   values (24/7, ~30s, Free) are printed as-is.
   --------------------------------------------------------------------------- */
export function CountUp({
  value,
  className,
  style,
}: {
  value: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const still = useStillness();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  /* Split "80+" into 80 and "+", or bail out for anything not lead-numeric. */
  const match = /^(\D*)(\d+(?:\.\d+)?)(.*)$/.exec(value);

  useEffect(() => {
    if (!match || still || !inView || !ref.current) return;

    const target = Number(match[2]);
    const decimals = match[2].includes(".") ? 1 : 0;
    const node = ref.current;

    const controls = animate(0, target, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        node.textContent = `${match[1]}${latest.toFixed(decimals)}${match[3]}`;
      },
    });

    return () => controls.stop();
  }, [inView, match, still]);

  const initial =
    !match || still ? value : `${match[1]}0${match[3]}`;

  return (
    <span ref={ref} className={className} style={style}>
      {initial}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   DrawnPath
   An SVG path that draws itself the first time it scrolls into view.
   --------------------------------------------------------------------------- */
export function DrawnPath({
  d,
  stroke,
  strokeWidth = 2,
  delay = 0,
  duration = 1.6,
  dashed = false,
}: {
  d: string;
  stroke: string;
  strokeWidth?: number;
  delay?: number;
  duration?: number;
  dashed?: boolean;
}) {
  const still = useStillness();

  return (
    <motion.path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeDasharray={dashed ? "5 7" : undefined}
      initial={still ? { pathLength: 1 } : { pathLength: 0 }}
      whileInView={{ pathLength: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: still ? 0 : duration, delay, ease: "easeInOut" }}
    />
  );
}

/* ---------------------------------------------------------------------------
   ScrollProgress
   Thin accent bar across the very top of the page.
   --------------------------------------------------------------------------- */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 26,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left"
      style={{
        scaleX,
        background: `linear-gradient(90deg, ${acc()}, ${acc2()}, ${acc3()})`,
      }}
    />
  );
}

/* ---------------------------------------------------------------------------
   ParallaxLift
   Nudges an element as it moves through the viewport. Small values only —
   this is seasoning, not the meal.
   --------------------------------------------------------------------------- */
export function ParallaxLift({
  children,
  className,
  distance = 40,
}: {
  children: React.ReactNode;
  className?: string;
  distance?: number;
}) {
  const still = useStillness();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);

  if (still) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div ref={ref} className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
   Typewriter
   Cycles a short list of words in place. Used for the one word in the hero
   that changes meaning per student.
   --------------------------------------------------------------------------- */
export function CyclingWord({
  words,
  className,
  interval = 2600,
}: {
  words: readonly string[];
  className?: string;
  interval?: number;
}) {
  const still = useStillness();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (still) return;
    const id = window.setInterval(
      () => setIndex((value) => (value + 1) % words.length),
      interval,
    );
    return () => window.clearInterval(id);
  }, [interval, still, words.length]);

  if (still) {
    return <span className={className}>{words[0]}</span>;
  }

  return (
    <span className={cn("relative inline-grid", className)}>
      {/* An invisible copy of the longest word reserves the width, so the
          line never reflows as the visible word changes. */}
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {words.reduce((a, b) => (a.length >= b.length ? a : b))}
      </span>
      <motion.span
        key={index}
        className="col-start-1 row-start-1 text-left"
        initial={{ opacity: 0, y: "0.35em", filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {words[index]}
      </motion.span>
    </span>
  );
}

/* ---------------------------------------------------------------------------
   AnimatedBars
   Fills a row of bars in sequence — the mock-marking visual.
   --------------------------------------------------------------------------- */
export function AnimatedBars({
  total,
  scored,
  colour,
}: {
  total: number;
  scored: number;
  colour: string;
}) {
  const still = useStillness();

  return (
    <div className="flex gap-1">
      {Array.from({ length: total }, (_, index) => {
        const earned = index < scored;
        return (
          <motion.span
            key={index}
            className="h-6 flex-1 rounded-[3px]"
            style={{ background: earned ? colour : text(0.12) }}
            initial={still ? { scaleY: 1 } : { scaleY: 0.15, opacity: 0.3 }}
            whileInView={{ scaleY: 1, opacity: 1 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{
              duration: still ? 0 : 0.45,
              delay: still ? 0 : index * 0.035,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   PulseGrid
   The spaced-repetition heatmap, with the due cells breathing.
   --------------------------------------------------------------------------- */
export function PulseGrid({
  cells,
  active,
  colour,
}: {
  cells: number;
  active: Set<number>;
  colour: string;
}) {
  const still = useStillness();

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: cells }, (_, index) => {
        const on = active.has(index);
        return (
          <motion.span
            key={index}
            className="aspect-square rounded-[4px]"
            style={{ background: on ? colour : text(0.09) }}
            animate={
              still || !on
                ? undefined
                : { opacity: [0.55, 1, 0.55], scale: [1, 1.08, 1] }
            }
            transition={{
              duration: 2.6,
              repeat: Infinity,
              delay: (index % 7) * 0.18,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   ProgressRing
   The Pomodoro dial, sweeping once on entry.
   --------------------------------------------------------------------------- */
export function ProgressRing({
  size = 56,
  progress = 0.7,
  colour,
  track,
}: {
  size?: number;
  progress?: number;
  colour: string;
  track: string;
}) {
  const still = useStillness();
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      style={{ width: size, height: size }}
      className="shrink-0"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={track}
        strokeWidth="4"
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={colour}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circumference}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        initial={
          still
            ? { strokeDashoffset: circumference * (1 - progress) }
            : { strokeDashoffset: circumference }
        }
        whileInView={{ strokeDashoffset: circumference * (1 - progress) }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: still ? 0 : 1.4, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}
