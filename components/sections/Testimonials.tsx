"use client";

import { Star } from "lucide-react";

import { Reveal } from "@/components/Reveal";
import { GlassCard, SectionHeading, toneColor } from "@/components/primitives";
import { useCountry } from "@/components/CountryToggle";
import {
  REGION,
  TESTIMONIALS_ROW_1,
  TESTIMONIALS_ROW_2,
  TESTIMONIALS_SECTION,
  type Testimonial,
} from "@/lib/content";
import { text } from "@/lib/theme";

export function Testimonials() {
  const [country] = useCountry();

  /* Hidden while there are no real testimonials to show. An empty praise
     section is worse than none; a fabricated one is worse still. */
  if (TESTIMONIALS_ROW_1.length + TESTIMONIALS_ROW_2.length === 0) return null;

  return (
    <section id="testimonials" className="relative py-20 sm:py-24 lg:py-28">
      <Reveal className="mx-auto max-w-[1180px] px-5 sm:px-6">
        <SectionHeading
          eyebrow={TESTIMONIALS_SECTION.eyebrow}
          heading={TESTIMONIALS_SECTION.heading}
          sub={REGION[country].testimonialsSub}
        />
      </Reveal>

      <div className="mt-14 space-y-4">
        <Row items={TESTIMONIALS_ROW_1} duration="58s" />
        <Row items={TESTIMONIALS_ROW_2} duration="66s" reverse />
      </div>
    </section>
  );
}

/* Cards are duplicated so the -50% keyframe loops seamlessly; the copies are
   hidden from assistive tech. */
function Row({
  items,
  duration,
  reverse = false,
}: {
  items: Testimonial[];
  duration: string;
  reverse?: boolean;
}) {
  const reel = [...items, ...items];

  return (
    <div className="marquee-row marquee-mask overflow-hidden">
      <div
        className={`marquee-track gap-4 px-2${reverse ? " reverse" : ""}`}
        style={{ ["--marquee-duration" as string]: duration }}
      >
        {reel.map((item, index) => (
          <div key={`${item.name}-${index}`} className="w-[340px] shrink-0 sm:w-[380px]">
            <Card item={item} duplicate={index >= items.length} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ item, duplicate }: { item: Testimonial; duplicate: boolean }) {
  const c = toneColor(item.tint as "acc" | "acc2" | "acc3");

  return (
    <GlassCard
      hover
      className="h-full p-6 sm:p-7"
      aria-hidden={duplicate || undefined}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, ${c(0.8)}, transparent)` }}
      />

      <Rating value={item.rating} />

      <blockquote
        className="mt-5 text-[15px] leading-[1.6] sm:text-[16px]"
        style={{ color: text(0.85) }}
      >
        “{item.quote}”
      </blockquote>

      <div className="mt-6 flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
          style={{ background: c(0.18), color: c(), border: `1px solid ${c(0.3)}` }}
        >
          {item.initials}
        </span>
        <span className="min-w-0">
          <span
            className="block text-[14.5px] font-bold leading-tight"
            style={{ color: text() }}
          >
            {item.name}
          </span>
          <span className="mt-0.5 block text-[12.5px]" style={{ color: text(0.5) }}>
            {item.detail}
          </span>
        </span>
      </div>
    </GlassCard>
  );
}

function Rating({ value }: { value: number }) {
  const full = Math.floor(value);
  const hasHalf = value % 1 !== 0;
  const gold = "#f5b942";

  return (
    <div className="flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: full }, (_, index) => (
        <Star
          key={`f-${index}`}
          className="h-3.5 w-3.5"
          style={{ fill: gold, color: gold }}
        />
      ))}

      {hasHalf && (
        <span className="relative inline-block h-3.5 w-3.5">
          <Star
            className="absolute inset-0 h-3.5 w-3.5"
            style={{ color: text(0.22) }}
          />
          <span className="absolute inset-0 overflow-hidden" style={{ width: "50%" }}>
            <Star className="h-3.5 w-3.5" style={{ fill: gold, color: gold }} />
          </span>
        </span>
      )}

      {Array.from({ length: 5 - full - (hasHalf ? 1 : 0) }, (_, index) => (
        <Star
          key={`e-${index}`}
          className="h-3.5 w-3.5"
          style={{ color: text(0.22) }}
        />
      ))}

      <span className="ml-2 text-[12px] font-bold" style={{ color: text(0.5) }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}
