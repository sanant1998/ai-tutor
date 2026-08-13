"use client";

import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

import { Reveal, RevealItem } from "@/components/Reveal";
import { BorderBeam, Spotlight } from "@/components/motion";
import { GlassCard, Mesh, SectionHeading } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { PLANS, PRICING_SECTION, type Plan } from "@/lib/content";
import { acc, text } from "@/lib/theme";

export function Pricing() {
  return (
    <section id="pricing" className="relative overflow-hidden py-20 sm:py-24 lg:py-28">
      <Mesh variant="soft" />

      <div className="relative z-10 mx-auto max-w-[1180px] px-5 sm:px-6">
        <SectionHeading
          eyebrow={PRICING_SECTION.eyebrow}
          heading={PRICING_SECTION.heading}
          sub={PRICING_SECTION.sub}
        />

        <div className="mt-14 grid items-stretch gap-4 lg:grid-cols-3">
          {PLANS.map((plan, index) => (
            <RevealItem key={plan.id} index={index}>
              <Spotlight className="h-full" tone={plan.featured ? "acc" : "acc2"}>
                <PlanCard plan={plan} />
              </Spotlight>
            </RevealItem>
          ))}
        </div>

        <Reveal delay={0.15}>
          <p
            className="mx-auto mt-8 max-w-2xl text-center text-[14px] leading-[1.6]"
            style={{ color: text(0.5) }}
          >
            {PRICING_SECTION.note}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <GlassCard
      strong={plan.featured}
      hover={!plan.comingSoon}
      className="flex h-full flex-col p-7 sm:p-8"
      style={plan.featured ? { borderColor: acc(0.35) } : undefined}
    >
      {plan.featured && <BorderBeam duration={8} />}

      {plan.featured && (
        <span
          className="absolute right-6 top-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em]"
          style={{ background: acc(0.18), color: acc() }}
        >
          <Sparkles className="h-3 w-3" />
          Most picked
        </span>
      )}

      <h3
        className="text-[13px] font-bold uppercase tracking-[0.18em]"
        style={{ color: text(0.55) }}
      >
        {plan.name}
      </h3>

      <div className="mt-5 flex items-baseline gap-2">
        <span
          className="font-display text-[2.4rem] font-extrabold leading-none tracking-[-0.03em]"
          style={{ color: text() }}
        >
          {plan.price}
        </span>
      </div>
      <p className="mt-2 text-[13px]" style={{ color: text(0.5) }}>
        {plan.period}
      </p>
      {plan.altPrice && (
        <p className="mt-1 text-[13px] font-medium" style={{ color: acc() }}>
          {plan.altPrice}
        </p>
      )}

      <p
        className="mt-5 text-[14.5px] leading-[1.6]"
        style={{ color: text(0.62) }}
      >
        {plan.tagline}
      </p>

      <ul className="mt-6 space-y-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <Check
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: plan.comingSoon ? text(0.35) : acc() }}
            />
            <span
              className="text-[14px] leading-[1.5]"
              style={{ color: text(plan.comingSoon ? 0.5 : 0.78) }}
            >
              {feature}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-8">
        {plan.comingSoon ? (
          <Button variant="glass" className="w-full" disabled>
            {plan.cta}
          </Button>
        ) : (
          <Button
            asChild
            variant={plan.featured ? "primary" : "glass"}
            className="w-full"
          >
            <Link href="/signup">{plan.cta}</Link>
          </Button>
        )}
      </div>
    </GlassCard>
  );
}
