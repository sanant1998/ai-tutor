import Link from "next/link";
import { ArrowLeft, Check, Quote } from "lucide-react";

import { Note, Star, Underline } from "@/components/doodles";
import { Float } from "@/components/Reveal";
import { GlassCard } from "@/components/primitives";
import { BRAND } from "@/lib/brand";
import { acc, acc2, acc3, text } from "@/lib/theme";

export type AuthQuote = {
  text: string;
  attribution: string;
};

export type AuthProof = {
  value: string;
  label: string;
};

/* Split frame shared by sign in and sign up: the form on the left, a paper
   collage on the right. Uses the same tokens as the landing page, so the
   theme picker's choice carries across. */
export function AuthShell({
  quote,
  proof,
  children,
}: {
  quote: AuthQuote;
  proof: AuthProof[];
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1fr_0.95fr]">
        <div className="flex flex-col px-5 py-8 sm:px-10 lg:px-14">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-[14px] font-medium transition-colors hover:text-[var(--acc)]"
              style={{ color: text(0.62) }}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>

            <Link
              href="/"
              className="font-display relative pb-1.5 text-[17px] font-extrabold tracking-[-0.02em]"
              style={{ color: text() }}
            >
              {BRAND.wordmark.lead}
              <span style={{ color: acc() }}>{BRAND.wordmark.accent}</span>
              <Underline className="inset-x-0 bottom-0 h-2 w-full" delay={0.2} />
            </Link>
          </div>

          <div className="flex flex-1 items-center justify-center py-12">
            <div className="w-full max-w-[420px]">{children}</div>
          </div>
        </div>

        <AuthAside quote={quote} proof={proof} />
      </div>
    </div>
  );
}

function AuthAside({ quote, proof }: { quote: AuthQuote; proof: AuthProof[] }) {
  return (
    <aside className="relative hidden p-6 lg:block">
      <GlassCard
        strong
        className="relative flex h-full flex-col justify-between overflow-hidden p-10 xl:p-12"
        style={{
          /* The same Unsplash desk photograph the current product uses. Swap
             it for a self-hosted file before launch — an external image on
             the auth screen is a third-party dependency on a critical path. */
          backgroundImage: `
            url(https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1400&q=80),
            repeating-linear-gradient(rgb(var(--text-rgb) / 0.05) 0 1px, transparent 1px 34px),
            radial-gradient(70% 55% at 88% 6%, rgb(var(--acc-rgb) / 0.16), transparent 70%),
            radial-gradient(60% 50% at 4% 96%, rgb(var(--acc-2-rgb) / 0.14), transparent 70%),
            linear-gradient(165deg, rgb(var(--bg-rgb) / 0.4), rgb(var(--bg-rgb) / 0.85))
          `,
          backgroundSize: "cover, auto, auto, auto, auto",
          backgroundPosition: "center",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        <p
          className="relative flex items-center gap-4 text-[11px] font-bold uppercase tracking-[0.22em]"
          style={{ color: text(0.5) }}
        >
          <span
            className="h-px w-8"
            style={{ background: text(0.3) }}
            aria-hidden="true"
          />
          Revision, refined
        </p>

        {/* Upper band: two product scraps, pinned at slight angles. */}
        <div className="relative mt-10 flex items-start gap-4">
          <Float amplitude={4} duration={9} className="flex-1">
            <PlanScrap />
          </Float>
          <Float amplitude={4} duration={11} delay={0.6} className="w-[46%]">
            <MarkedScrap />
          </Float>
        </div>

        <figure className="relative mt-auto pt-10">
          <Quote className="h-7 w-7" style={{ color: acc(0.5) }} aria-hidden="true" />
          <blockquote
            className="font-display mt-4 text-[1.75rem] font-extrabold leading-[1.16] tracking-[-0.025em] xl:text-[2rem]"
            style={{ color: text() }}
          >
            {quote.text}
          </blockquote>
          <figcaption
            className="mt-4 text-[12px] font-bold uppercase tracking-[0.18em]"
            style={{ color: acc2() }}
          >
            — {quote.attribution}
          </figcaption>
        </figure>

        {/* Lower band: the human note, in marker pen. */}
        <div className="relative mt-8 flex items-end justify-between gap-6">
          <StickyNote />
          <div className="relative h-16 w-20 shrink-0">
            <Star className="right-2 top-2 h-7 w-7" />
          </div>
        </div>

        <dl
          className="relative mt-10 grid grid-cols-3 gap-4 border-t pt-7"
          style={{ borderColor: "var(--line)" }}
        >
          {proof.map((item) => (
            <div key={item.label}>
              <dt className="sr-only">{item.label}</dt>
              <dd
                className="font-display text-[1.5rem] font-extrabold leading-none tracking-[-0.02em]"
                style={{ color: text() }}
              >
                {item.value}
              </dd>
              <p
                className="mt-1.5 text-[12px] leading-snug"
                style={{ color: text(0.5) }}
              >
                {item.label}
              </p>
            </div>
          ))}
        </dl>
      </GlassCard>
    </aside>
  );
}

/* A torn-off corner of tonight's plan. */
function PlanScrap() {
  const rows = [
    { label: "Organic reactions", done: true },
    { label: "Differentiation", done: true },
    { label: "Forces and motion", done: false },
  ];

  return (
    <div
      className="rotate-[-2deg] rounded-2xl p-4 shadow-lg"
      style={{
        background: "var(--glass-2)",
        border: `1px solid ${text(0.1)}`,
      }}
    >
      <div className="flex items-center justify-between">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: text(0.55) }}
        >
          Tonight
        </p>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ background: acc(0.14), color: acc() }}
        >
          2 / 3
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <span
              className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px]"
              style={{
                background: row.done ? acc() : "transparent",
                border: `1.5px solid ${row.done ? acc() : text(0.22)}`,
              }}
            >
              {row.done && (
                <Check
                  className="h-2.5 w-2.5"
                  strokeWidth={3.5}
                  style={{ color: "var(--onacc)" }}
                />
              )}
            </span>
            <span
              className="truncate text-[12px]"
              style={{ color: row.done ? text(0.45) : text(0.85) }}
            >
              {row.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* A marked paper, reduced to the one number that matters. */
function MarkedScrap() {
  return (
    <div
      className="rotate-[3deg] rounded-2xl p-4 shadow-lg"
      style={{
        background: "var(--glass-2)",
        border: `1px solid ${text(0.1)}`,
      }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ color: text(0.55) }}
      >
        Marked in 30s
      </p>

      <p
        className="font-display mt-2 text-[1.7rem] font-extrabold leading-none tracking-[-0.02em]"
        style={{ color: text() }}
      >
        18<span style={{ color: text(0.35) }}>/20</span>
      </p>

      <div className="mt-3 flex gap-[3px]" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <span
            key={index}
            className="h-3 flex-1 rounded-[2px]"
            style={{ background: index < 9 ? acc3(0.7) : text(0.14) }}
          />
        ))}
      </div>
    </div>
  );
}

/* The handwritten aside, on a pastel square. */
function StickyNote() {
  return (
    <div
      className="rotate-[-3deg] rounded-sm px-5 py-4 shadow-md"
      style={{
        background: acc2(0.14),
        border: `1px solid ${acc2(0.22)}`,
      }}
    >
      <Note className="static text-[1.3rem]" rotate={0} colour={text(0.85)} delay={0.6}>
        One plan.
        <br />
        One place.
      </Note>
    </div>
  );
}
