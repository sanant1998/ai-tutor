"use client";

import { useCountry } from "@/components/CountryToggle";
import { REGION } from "@/lib/content";
import { text } from "@/lib/theme";

/* Quiet marquee of boards and subjects. Content is duplicated so the -50%
   keyframe loops seamlessly. */
export function TrustStrip() {
  const [country] = useCountry();
  const items = REGION[country].trustItems;
  const reel = [...items, ...items];

  return (
    <section
      aria-label="Boards and subjects covered"
      className="relative border-y py-6"
      style={{ borderColor: "var(--line)" }}
    >
      <p
        className="mb-5 text-center text-[11px] font-bold uppercase tracking-[0.22em]"
        style={{ color: text(0.4) }}
      >
        Mapped to the specification you actually sit
      </p>

      <div className="marquee-row marquee-mask overflow-hidden">
        <div
          className="marquee-track gap-10 px-5"
          style={{ ["--marquee-duration" as string]: "38s" }}
        >
          {reel.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="whitespace-nowrap text-[14px] font-semibold tracking-[0.01em]"
              style={{ color: text(0.55) }}
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
