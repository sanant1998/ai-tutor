"use client";

import { motion } from "framer-motion";

import { useStillness } from "@/components/Reveal";
import { cn } from "@/lib/utils";
import { acc, acc2 } from "@/lib/theme";

/* Hand-drawn marks. Each path is deliberately uneven — a perfectly smooth
   curve reads as a graphic, not as something someone drew on the page. */

/* The double swoosh under a highlighted phrase. */
export function Underline({
  className,
  colour,
  delay = 0.5,
}: {
  className?: string;
  colour?: string;
  delay?: number;
}) {
  const still = useStillness();
  const stroke = colour ?? acc(0.85);

  const draw = (d: string, extraDelay: number) => (
    <motion.path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={4}
      strokeLinecap="round"
      initial={still ? { pathLength: 1 } : { pathLength: 0 }}
      whileInView={{ pathLength: 1 }}
      viewport={{ once: true }}
      transition={{
        duration: still ? 0 : 0.7,
        delay: still ? 0 : delay + extraDelay,
        ease: "easeOut",
      }}
    />
  );

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 300 24"
      preserveAspectRatio="none"
      className={cn("pointer-events-none absolute", className)}
    >
      {draw("M4 11 C 62 4, 128 5, 204 8 S 268 12, 296 9", 0)}
      {draw("M14 19 C 78 13, 150 15, 232 17", 0.18)}
    </svg>
  );
}

/* The curving arrow that points from a margin note to the thing it is about. */
export function CurvedArrow({
  className,
  colour,
  delay = 0.8,
  flip = false,
}: {
  className?: string;
  colour?: string;
  delay?: number;
  flip?: boolean;
}) {
  const still = useStillness();
  const stroke = colour ?? acc2(0.9);

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 90 120"
      fill="none"
      className={cn(
        "pointer-events-none absolute",
        flip && "-scale-x-100",
        className,
      )}
    >
      <motion.path
        d="M8 6 C 44 20, 66 52, 64 100"
        stroke={stroke}
        strokeWidth={3}
        strokeLinecap="round"
        initial={still ? { pathLength: 1 } : { pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: still ? 0 : 0.9, delay: still ? 0 : delay }}
      />
      <motion.path
        d="M52 84 L64 104 L78 90"
        stroke={stroke}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={still ? { pathLength: 1 } : { pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{
          duration: still ? 0 : 0.35,
          delay: still ? 0 : delay + 0.75,
        }}
      />
    </svg>
  );
}

/* A quick circled-star, the kind people scribble next to something. */
export function Star({ className, colour }: { className?: string; colour?: string }) {
  const still = useStillness();
  const stroke = colour ?? acc(0.5);

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      fill="none"
      className={cn("pointer-events-none absolute", className)}
    >
      <motion.path
        d="M20 5 L24 16 L36 17 L27 25 L30 37 L20 30 L10 37 L13 25 L4 17 L16 16 Z"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
        initial={still ? { pathLength: 1 } : { pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: still ? 0 : 1, delay: still ? 0 : 1.1 }}
      />
    </svg>
  );
}

/* Margin note in marker pen. */
export function Note({
  children,
  className,
  colour,
  rotate = -4,
  delay = 0.4,
}: {
  children: React.ReactNode;
  className?: string;
  colour?: string;
  rotate?: number;
  delay?: number;
}) {
  const still = useStillness();

  return (
    <motion.p
      aria-hidden="true"
      className={cn(
        "font-hand pointer-events-none absolute text-[1.35rem] leading-[1.15] sm:text-[1.6rem]",
        className,
      )}
      style={{ color: colour ?? acc2(0.95), rotate: `${rotate}deg` }}
      initial={still ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: still ? 0 : 0.5, delay: still ? 0 : delay }}
    >
      {children}
    </motion.p>
  );
}
