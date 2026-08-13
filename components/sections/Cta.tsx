"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal } from "@/components/Reveal";
import { Aurora, BorderBeam } from "@/components/motion";
import { GlassCard } from "@/components/primitives";
import { scrollToSection } from "@/components/SmoothScroll";
import { Button } from "@/components/ui/button";
import { CTA } from "@/lib/content";
import { text } from "@/lib/theme";

export function Cta() {
  return (
    <section className="relative px-5 pb-20 pt-4 sm:px-6 sm:pb-24 lg:pb-28">
      <Reveal>
        <GlassCard
          strong
          className="dot-grid mx-auto max-w-[1180px] overflow-hidden px-6 py-16 text-center sm:px-10 sm:py-20"
        >
          <Aurora />
          <BorderBeam duration={13} />

          <div className="relative z-10 mx-auto max-w-2xl">
            <h2
              className="font-display text-[2.2rem] font-extrabold leading-[1.06] tracking-[-0.035em] sm:text-[3rem] lg:text-[3.4rem]"
              style={{ color: text() }}
            >
              {CTA.heading}
            </h2>
            <p
              className="mx-auto mt-5 max-w-xl text-[16px] leading-[1.7] sm:text-[18px]"
              style={{ color: text(0.65) }}
            >
              {CTA.sub}
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/signup">
                  {CTA.primary}
                  <ArrowRight className="h-[18px] w-[18px]" />
                </Link>
              </Button>
              <Button
                type="button"
                variant="glass"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => scrollToSection("pricing")}
              >
                {CTA.secondary}
              </Button>
            </div>
          </div>
        </GlassCard>
      </Reveal>
    </section>
  );
}
