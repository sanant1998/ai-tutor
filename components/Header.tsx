"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";

import { AppearanceMenu } from "@/components/AppearanceMenu";
import { Underline } from "@/components/doodles";
import { scrollToSection } from "@/components/SmoothScroll";
import { useStillness } from "@/components/Reveal";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { NAV_LINKS } from "@/lib/content";
import { acc, text } from "@/lib/theme";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const still = useStillness();

  /* The bar only earns its glass once the page has moved. */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  const go = (target: string) => {
    setMenuOpen(false);
    scrollToSection(target);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6">
      <div
        className={`mx-auto flex max-w-[1180px] items-center justify-between gap-3 rounded-full px-4 py-2.5 transition-all duration-500 sm:px-5 ${
          scrolled ? "glass-strong" : "border border-transparent"
        }`}
      >
        <Link
          href="/"
          className="font-display relative shrink-0 pb-1.5 text-[18px] font-extrabold tracking-[-0.02em] sm:text-[19px]"
          style={{ color: text() }}
        >
          {BRAND.wordmark.lead}
          <span style={{ color: acc() }}>{BRAND.wordmark.accent}</span>
          <Underline className="inset-x-0 bottom-0 h-2 w-full" delay={0.2} />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <button
              key={link.target}
              type="button"
              onClick={() => go(link.target)}
              className="rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors hover:bg-[rgb(var(--text-rgb)/0.07)]"
              style={{ color: text(0.72) }}
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <AppearanceMenu />

          <Link
            href="/login"
            className="hidden rounded-full px-3 py-2 text-[14px] font-semibold transition-colors hover:bg-[rgb(var(--text-rgb)/0.07)] sm:inline-block"
            style={{ color: text(0.85) }}
          >
            Log in
          </Link>

          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/signup">Start free</Link>
          </Button>

          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
            className="glass flex h-10 w-10 items-center justify-center rounded-full md:hidden"
            style={{ color: text(0.85) }}
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            initial={still ? false : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={still ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong mx-auto mt-3 max-w-[1180px] rounded-3xl p-3 md:hidden"
          >
            {NAV_LINKS.map((link) => (
              <button
                key={link.target}
                type="button"
                onClick={() => go(link.target)}
                className="w-full rounded-2xl px-4 py-3 text-left text-[16px] font-semibold transition-colors hover:bg-[rgb(var(--text-rgb)/0.06)]"
                style={{ color: text(0.85) }}
              >
                {link.label}
              </button>
            ))}

            <div className="mt-2 flex gap-2 border-t pt-3" style={{ borderColor: "var(--line)" }}>
              <Button asChild variant="glass" className="flex-1">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild className="flex-1">
                <Link href="/signup">Start free</Link>
              </Button>
            </div>

            <p className="px-4 pt-3 text-[12px]" style={{ color: text(0.45) }}>
              Free plan needs no card ·{" "}
              <span style={{ color: acc() }}>3-day Pro trial</span>
            </p>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
