"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { RevealItem, Reveal } from "@/components/Reveal";
import { DrawnPath, Spotlight } from "@/components/motion";
import { GlassCard, SectionHeading } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { HOW_SECTION, HOW_STEPS } from "@/lib/content";
import { acc, text } from "@/lib/theme";

export function HowItWorks() {
  return (
    <section id="how" className="relative py-20 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-[1180px] px-5 sm:px-6">
        <SectionHeading
          eyebrow={HOW_SECTION.eyebrow}
          heading={HOW_SECTION.heading}
          sub={HOW_SECTION.sub}
        />

        <div className="relative mt-14">
          {/* The connector behind the three cards draws itself in as the row
              scrolls into view. Desktop only — it has nothing to connect on a
              stacked layout. */}
          <svg
            aria-hidden="true"
            className="absolute inset-x-0 top-[52px] hidden h-8 w-full lg:block"
            viewBox="0 0 1000 32"
            preserveAspectRatio="none"
          >
            <DrawnPath
              d="M60 16 C 280 16, 300 16, 500 16 S 720 16, 940 16"
              stroke={acc(0.4)}
              strokeWidth={2}
              dashed
              duration={1.8}
            />
          </svg>

          <ol className="relative grid gap-4 md:grid-cols-3">
            {HOW_STEPS.map((step, index) => (
              <RevealItem key={step.n} index={index}>
                <Spotlight className="h-full">
                <GlassCard hover className="h-full p-7">
                  <span
                    className="font-display flex h-12 w-12 items-center justify-center rounded-2xl text-[15px] font-extrabold"
                    style={{
                      background: acc(0.14),
                      border: `1px solid ${acc(0.3)}`,
                      color: acc(),
                    }}
                  >
                    {step.n}
                  </span>
                  <h3
                    className="font-display mt-6 text-[1.35rem] font-extrabold leading-[1.2] tracking-[-0.02em]"
                    style={{ color: text() }}
                  >
                    {step.title}
                  </h3>
                  <p
                    className="mt-3 text-[15px] leading-[1.65]"
                    style={{ color: text(0.6) }}
                  >
                    {step.body}
                  </p>
                </GlassCard>
                </Spotlight>
              </RevealItem>
            ))}
          </ol>
        </div>

        <Reveal delay={0.2}>
          <div className="mt-10 flex justify-center">
            <Button asChild size="lg">
              <Link href="/signup">
                Build my first roadmap
                <ArrowRight className="h-[18px] w-[18px]" />
              </Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
