"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/* True when the visitor has switched on calm mode. Framer's animations are
   JS-driven, so the CSS override in globals.css cannot reach them — they have
   to opt out here instead. */
export function useCalm() {
  const [calm, setCalm] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setCalm(root.classList.contains("a11y-calm"));

    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return calm;
}

export function useStillness() {
  const reduced = useReducedMotion();
  const calm = useCalm();
  return reduced || calm;
}

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
};

/* Fade-and-rise the first time an element scrolls into view. */
export function Reveal({ children, className, delay = 0, y = 22 }: RevealProps) {
  const still = useStillness();

  if (still) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* Staggered variant for grids: pass the item's index and it works out its
   own delay, capped so long lists do not crawl in. */
export function RevealItem({
  index,
  children,
  className,
  y = 22,
}: {
  index: number;
  children: ReactNode;
  className?: string;
  y?: number;
}) {
  return (
    <Reveal className={className} delay={Math.min(index * 0.06, 0.36)} y={y}>
      {children}
    </Reveal>
  );
}

/* A gentle continuous float for decorative panels. */
export function Float({
  children,
  className,
  amplitude = 5,
  duration = 6,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  amplitude?: number;
  duration?: number;
  delay?: number;
}) {
  const still = useStillness();

  if (still) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      animate={{ y: [-amplitude, amplitude, -amplitude] }}
      transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}
