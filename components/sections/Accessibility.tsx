"use client";

import {
  AlignJustify,
  Brain,
  Contrast,
  Palette,
  Type,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Reveal, RevealItem } from "@/components/Reveal";
import {
  Eyebrow,
  GlassCard,
  IconTile,
  Mesh,
} from "@/components/primitives";
import { ACCESSIBILITY } from "@/lib/content";
import { acc, text } from "@/lib/theme";

const ICONS: Record<string, LucideIcon> = {
  type: Type,
  align: AlignJustify,
  brain: Brain,
  contrast: Contrast,
};

export function Accessibility() {
  return (
    <section
      id="accessibility"
      className="relative overflow-hidden py-20 sm:py-24 lg:py-28"
    >
      <Mesh variant="soft" />

      <div className="relative z-10 mx-auto max-w-[1180px] px-5 sm:px-6">
        <div className="grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <Reveal>
            <Eyebrow>{ACCESSIBILITY.eyebrow}</Eyebrow>
            <h2
              className="font-display mt-5 text-[2rem] font-extrabold leading-[1.1] tracking-[-0.03em] sm:text-[2.5rem]"
              style={{ color: text() }}
            >
              {ACCESSIBILITY.heading}
            </h2>
            <p
              className="mt-5 text-[16px] leading-[1.7] sm:text-[17px]"
              style={{ color: text(0.62) }}
            >
              {ACCESSIBILITY.body}
            </p>

            <div
              className="mt-7 flex items-center gap-3 rounded-2xl px-4 py-3"
              style={{ background: acc(0.1), border: `1px solid ${acc(0.24)}` }}
            >
              <Palette className="h-4 w-4 shrink-0" style={{ color: acc() }} />
              <p className="text-[13.5px] font-medium" style={{ color: text(0.8) }}>
                {ACCESSIBILITY.hint}
              </p>
            </div>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2">
            {ACCESSIBILITY.features.map((feature, index) => {
              const Icon = ICONS[feature.icon];
              return (
                <RevealItem key={feature.title} index={index}>
                  <GlassCard hover className="h-full p-6">
                    <IconTile tone={index % 2 === 0 ? "acc" : "acc2"}>
                      <Icon className="h-[19px] w-[19px]" />
                    </IconTile>
                    <h3
                      className="font-display mt-5 text-[1.05rem] font-extrabold tracking-[-0.01em]"
                      style={{ color: text() }}
                    >
                      {feature.title}
                    </h3>
                    <p
                      className="mt-2.5 text-[14px] leading-[1.6]"
                      style={{ color: text(0.6) }}
                    >
                      {feature.body}
                    </p>
                  </GlassCard>
                </RevealItem>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
