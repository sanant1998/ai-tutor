"use client";

import { useEffect } from "react";
import Lenis from "lenis";

let lenisInstance: Lenis | null = null;

/* Lenis smooth scrolling, as the original page used. Disabled whenever the
   visitor has asked for reduced motion or has calm mode switched on. */
export function SmoothScroll() {
  useEffect(() => {
    const root = document.documentElement;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReduced || root.classList.contains("a11y-calm")) return;

    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenisInstance = lenis;

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      lenisInstance = null;
    };
  }, []);

  return null;
}

/* Scrolls to a section id. Routed through Lenis when it is running so the
   two scroll systems never fight; falls back to the native behaviour when
   smooth scrolling is switched off. */
export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;

  if (lenisInstance) {
    lenisInstance.scrollTo(el, { offset: -72 });
    return;
  }

  el.scrollIntoView({ behavior: "smooth", block: "start" });
}
