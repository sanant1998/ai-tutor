"use client";

/* The client half of the Boards section: picks one of the two summaries its
   server parent computed, following the header toggle. See Boards.tsx for why
   the split exists. */

import Link from "next/link";
import { ArrowUpRight, GraduationCap, MapPin } from "lucide-react";

import { useCountry } from "@/components/CountryToggle";
import { Reveal, RevealItem } from "@/components/Reveal";
import { Spotlight } from "@/components/motion";
import { GlassCard, IconTile, SectionHeading } from "@/components/primitives";
import { acc, text } from "@/lib/theme";

export type BoardCard = {
  name: string;
  detail: string;
  basis: string;
  /* What is open today, or null when nothing is. */
  ready: string | null;
};

type Group = {
  region: string;
  sub: string;
  footnote: string;
  cards: BoardCard[];
};

export function BoardsForCountry({
  eyebrow,
  heading,
  byCountry,
}: {
  eyebrow: string;
  heading: string;
  byCountry: Record<"in" | "us", Group>;
}) {
  const [country] = useCountry();
  const group = byCountry[country];

  return (
    <section id="boards" className="relative py-20 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-[1180px] px-5 sm:px-6">
        <SectionHeading eyebrow={eyebrow} heading={heading} sub={group.sub} />

        <div className="mt-14">
          <Reveal>
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 shrink-0" style={{ color: acc() }} />
              <h3
                className="whitespace-nowrap text-[12px] font-bold uppercase tracking-[0.18em]"
                style={{ color: text(0.55) }}
              >
                {group.region}
              </h3>
              <span className="h-px flex-1" style={{ background: "var(--line)" }} />
            </div>
          </Reveal>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {group.cards.map((board, index) => (
              <RevealItem key={board.name} index={index}>
                <Link href="/signup" className="group block h-full">
                  <Spotlight className="h-full">
                    <GlassCard hover className="h-full p-6">
                      <div className="flex items-start gap-4">
                        <IconTile>
                          <GraduationCap className="h-5 w-5" />
                        </IconTile>

                        <div className="min-w-0 flex-1">
                          <p
                            className="font-display text-[1.2rem] font-extrabold leading-tight tracking-[-0.02em]"
                            style={{ color: text() }}
                          >
                            {board.name}
                          </p>
                          <p className="mt-1 text-[14px]" style={{ color: text(0.6) }}>
                            {board.detail}
                          </p>

                          {/* What is open, or that nothing is. A card with no
                              third line would read as a board that works. */}
                          {board.ready ? (
                            <p className="mt-3 text-[12.5px]" style={{ color: acc() }}>
                              {board.ready}
                            </p>
                          ) : (
                            <p className="mt-3 text-[12.5px]" style={{ color: text(0.42) }}>
                              {board.basis} · not open yet
                            </p>
                          )}
                        </div>

                        <ArrowUpRight
                          className="h-5 w-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                          style={{ color: acc() }}
                        />
                      </div>
                    </GlassCard>
                  </Spotlight>
                </Link>
              </RevealItem>
            ))}
          </div>
        </div>

        <Reveal delay={0.1}>
          <p
            className="mx-auto mt-10 max-w-xl text-center text-[15px] leading-[1.6]"
            style={{ color: text(0.55) }}
          >
            {group.footnote}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
