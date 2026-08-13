"use client";

import { Check, X } from "lucide-react";

import { Reveal } from "@/components/Reveal";
import { GlassCard, Mesh, SectionHeading } from "@/components/primitives";
import { COMPARE_SECTION } from "@/lib/content";
import { acc, acc2, text } from "@/lib/theme";

export function Compare() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-24 lg:py-28">
      <Mesh variant="soft" />

      <div className="relative z-10 mx-auto max-w-[1180px] px-5 sm:px-6">
        <SectionHeading
          eyebrow={COMPARE_SECTION.eyebrow}
          heading={COMPARE_SECTION.heading}
          sub={COMPARE_SECTION.sub}
        />

        <div className="mt-14 grid gap-4 lg:grid-cols-2">
          <Reveal>
            <GlassCard className="h-full p-7 sm:p-8">
              <ColumnHeader
                label={COMPARE_SECTION.before.label}
                tone={acc2}
                icon={<X className="h-3.5 w-3.5" />}
              />
              <ul className="mt-6 space-y-4">
                {COMPARE_SECTION.before.items.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ background: text(0.08), color: text(0.45) }}
                    >
                      <X className="h-3 w-3" />
                    </span>
                    <span
                      className="text-[15px] leading-[1.55]"
                      style={{ color: text(0.55) }}
                    >
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          </Reveal>

          <Reveal delay={0.08}>
            <GlassCard
              strong
              className="h-full p-7 sm:p-8"
              style={{ borderColor: acc(0.28) }}
            >
              <ColumnHeader
                label={COMPARE_SECTION.after.label}
                tone={acc}
                icon={<Check className="h-3.5 w-3.5" />}
              />
              <ul className="mt-6 space-y-4">
                {COMPARE_SECTION.after.items.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ background: acc(0.18), color: acc() }}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    <span
                      className="text-[15px] font-medium leading-[1.55]"
                      style={{ color: text(0.88) }}
                    >
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function ColumnHeader({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: (a?: number) => string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-xl"
        style={{ background: tone(0.16), color: tone() }}
      >
        {icon}
      </span>
      <h3
        className="text-[13px] font-bold uppercase tracking-[0.16em]"
        style={{ color: text(0.7) }}
      >
        {label}
      </h3>
    </div>
  );
}
