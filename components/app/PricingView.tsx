"use client";

import Link from "next/link";
import { Check, Crown, Sparkles, Zap } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { useCountry } from "@/components/CountryToggle";
import { PLANS_BY_COUNTRY, PRICING_SECTION, REGION, type Plan } from "@/lib/content";
import { acc, acc2, text } from "@/lib/theme";

const ICONS = {
  sparkle: Sparkles,
  zap: Zap,
  crown: Crown,
} as const;

export function PricingView() {
  const [country] = useCountry();
  const plans = PLANS_BY_COUNTRY[country];

  return (
    <div>
      <div className="mx-auto max-w-3xl text-center">
        <p
          className="font-mono text-[11.5px] font-bold uppercase tracking-[0.16em]"
          style={{ color: acc() }}
        >
          ✦ {PRICING_SECTION.eyebrow}
        </p>
        <h1
          className="font-display mt-4 text-[2.2rem] font-extrabold leading-[1.05] tracking-[-0.04em] sm:text-[3rem]"
          style={{ color: text() }}
        >
          {PRICING_SECTION.heading}
        </h1>
        <p
          className="mx-auto mt-4 max-w-2xl text-[15px] leading-[1.65]"
          style={{ color: text(0.6) }}
        >
          {PRICING_SECTION.sub}
        </p>
      </div>

      {/* The launch-offer banner stood here, advertising "50% off your first
          month — code REVISE50". Checkout has never implemented that code, so
          the banner was an instruction to type something that does nothing.
          See lib/content.ts where the copy was removed. */}

      <div
        className={`mt-9 grid items-stretch gap-4 ${
          plans.length > 1 ? "sm:grid-cols-2" : "mx-auto max-w-md"
        }`}
      >
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>

      <p
        className="mx-auto mt-7 max-w-2xl text-center text-[13.5px] leading-[1.6]"
        style={{ color: text(0.5) }}
      >
        {REGION[country].pricingNote}
      </p>
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const Icon = ICONS[plan.icon];
  const tick = plan.featured ? acc() : plan.comingSoon ? acc2() : "#22c55e";

  return (
    <div className="relative">
      {plan.featured && (
        <span
          className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full px-3.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ background: acc(), color: "var(--onacc)" }}
        >
          Most popular
        </span>
      )}

      <Panel
        className="flex h-full flex-col p-6 sm:p-7"
        style={plan.featured ? { borderColor: acc(0.45) } : undefined}
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: text(0.06), color: text(0.7) }}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <p
            className="font-mono text-[11.5px] font-bold uppercase tracking-[0.16em]"
            style={{ color: text(0.6) }}
          >
            {plan.name}
          </p>
        </div>

        <h2
          className="font-display mt-5 text-[1.45rem] font-extrabold leading-[1.15] tracking-[-0.025em]"
          style={{ color: text() }}
        >
          {plan.tagline}
        </h2>

        <div className="mt-6 flex flex-wrap items-baseline gap-2">
          <span
            className="font-display text-[2.6rem] font-extrabold leading-none tracking-[-0.04em]"
            style={{ color: text() }}
          >
            {plan.price}
          </span>
          {plan.wasPrice && (
            <span
              className="text-[1.1rem] font-semibold line-through"
              style={{ color: text(0.35) }}
            >
              {plan.wasPrice}
            </span>
          )}
          {!plan.wasPrice && (
            <span className="text-[14px]" style={{ color: text(0.5) }}>
              {plan.period}
            </span>
          )}
        </div>

        {plan.wasPrice && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[13.5px]" style={{ color: text(0.55) }}>
              {plan.period}
            </span>
            {plan.discountBadge && (
              <span
                className="rounded-md px-2 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.1em]"
                style={{ background: acc(0.16), color: acc() }}
              >
                {plan.discountBadge}
              </span>
            )}
          </div>
        )}

        {plan.altPrice && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px]">
            <span style={{ color: text(0.6) }}>{plan.altPrice}</span>
            {plan.altBadge && (
              <span
                className="rounded-md px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.1em]"
                style={{ background: "rgb(34 197 94 / 0.16)", color: "#22c55e" }}
              >
                {plan.altBadge}
              </span>
            )}
          </p>
        )}

        <ul className="mt-6 space-y-3">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: tick }} />
              <span
                className="text-[13.5px] leading-[1.5]"
                style={{ color: text(0.75) }}
              >
                {feature}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-7">
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
              <Link href="/settings">{plan.cta}</Link>
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}
