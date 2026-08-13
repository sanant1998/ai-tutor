"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";

import { Reveal, useStillness } from "@/components/Reveal";
import { GlassCard, SectionHeading } from "@/components/primitives";
import { FAQS, FAQ_SECTION } from "@/lib/content";
import { acc, text } from "@/lib/theme";

export function Faq() {
  /* The first answer is open on arrival, so the pattern is obvious. */
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const still = useStillness();

  return (
    <section id="faq" className="relative py-20 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-[820px] px-5 sm:px-6">
        <Reveal>
          <SectionHeading
            eyebrow={FAQ_SECTION.eyebrow}
            heading={FAQ_SECTION.heading}
            sub={FAQ_SECTION.sub}
          />
        </Reveal>

        <div className="mt-12 space-y-3">
          {FAQS.map((faq, index) => {
            const open = openIndex === index;
            const panelId = `faq-panel-${index}`;
            const buttonId = `faq-button-${index}`;

            return (
              <Reveal key={faq.q} delay={Math.min(index * 0.02, 0.2)} y={12}>
                <GlassCard
                  className="overflow-hidden"
                  style={open ? { borderColor: acc(0.28) } : undefined}
                >
                  <h3>
                    <button
                      type="button"
                      id={buttonId}
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => setOpenIndex(open ? null : index)}
                      className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-[rgb(var(--text-rgb)/0.03)]"
                    >
                      <span
                        className="font-display text-[16px] font-bold leading-snug tracking-[-0.01em] sm:text-[17px]"
                        style={{ color: text() }}
                      >
                        {faq.q}
                      </span>
                      <motion.span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                        style={{
                          background: open ? acc(0.18) : text(0.07),
                          color: open ? acc() : text(0.6),
                        }}
                        animate={{ rotate: open ? 45 : 0 }}
                        transition={{ duration: still ? 0 : 0.25 }}
                      >
                        <Plus className="h-4 w-4" />
                      </motion.span>
                    </button>
                  </h3>

                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        id={panelId}
                        role="region"
                        aria-labelledby={buttonId}
                        className="overflow-hidden"
                        initial={still ? false : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={still ? undefined : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <p
                          className="px-6 pb-6 text-[15px] leading-[1.7]"
                          style={{ color: text(0.62) }}
                        >
                          {faq.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
