"use client";

import Link from "next/link";
import { ArrowRight, Check, Lock, ShieldCheck, Sparkles } from "lucide-react";

import { CurvedArrow, Note, Star, Underline } from "@/components/doodles";
import { Float, Reveal } from "@/components/Reveal";
import { scrollToSection } from "@/components/SmoothScroll";
import { Button } from "@/components/ui/button";
import { useCountry } from "@/components/CountryToggle";
import { HERO, REGION } from "@/lib/content";
import { acc, acc2, acc3, text } from "@/lib/theme";

export function Hero() {
  const [country] = useCountry();
  const region = REGION[country];

  return (
    <section className="relative overflow-hidden pb-14 pt-28 sm:pt-32 lg:pb-20 lg:pt-36">
      <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-5 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-8">
        <div className="relative z-10">
          <Reveal>
            <span
              className="inline-flex items-center gap-2 rounded-full bg-[var(--glass-2)] px-4 py-2 text-[13px] font-semibold shadow-sm"
              style={{ border: `1px solid ${text(0.1)}`, color: text(0.75) }}
            >
              <Sparkles className="h-4 w-4" style={{ color: acc() }} />
              {region.heroBadge}
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h1
              className="font-display mt-7 text-[2.7rem] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-[3.4rem] lg:text-[3.9rem]"
              style={{ color: text() }}
            >
              {HERO.headline.lead}{" "}
              <span className="relative inline-block whitespace-nowrap pb-3">
                <span
                  className="font-hand pr-1 text-[1.15em] font-bold italic leading-none"
                  style={{ color: acc() }}
                >
                  {HERO.headline.accent}
                </span>
                <Underline className="inset-x-0 bottom-0 h-4 w-full" />
              </span>
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p
              className="mt-6 max-w-xl text-[16px] leading-[1.75] sm:text-[17.5px]"
              style={{ color: text(0.62) }}
            >
              {HERO.sub}
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/signup">
                  {HERO.primaryCta}
                  <ArrowRight className="h-[18px] w-[18px]" />
                </Link>
              </Button>
              <Button
                type="button"
                variant="glass"
                size="lg"
                className="bg-[var(--glass-2)] shadow-sm"
                onClick={() => scrollToSection("how")}
              >
                {HERO.secondaryCta}
              </Button>
            </div>
          </Reveal>

          <Reveal delay={0.24}>
            <ul className="mt-9 flex flex-wrap gap-2">
              {/* The region chip first: it is the one that says which school
                  system this is for, and it changes with the toggle. */}
              <li>
                <TrustChip icon="students" label={region.heroTrust} />
              </li>
              {HERO.trust.map((item) => (
                <li key={item.label}>
                  <TrustChip icon={item.icon} label={item.label} />
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={0.1} className="relative">
          <DeskScene />
        </Reveal>
      </div>
    </section>
  );
}

function TrustChip({
  icon,
  label,
}: {
  icon: "students" | "check" | "lock";
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--glass-2)] py-1.5 pl-2 pr-3 text-[12px] font-semibold shadow-sm"
      style={{ border: `1px solid ${text(0.09)}`, color: text(0.72) }}
    >
      {icon === "students" && <AvatarStack />}
      {icon === "check" && (
        <ShieldCheck className="h-[18px] w-[18px]" style={{ color: acc3() }} />
      )}
      {icon === "lock" && (
        <Lock className="h-[18px] w-[18px]" style={{ color: text(0.5) }} />
      )}
      {label}
    </span>
  );
}

/* Three overlapping initial bubbles. Deliberately not photographs — using
   stock faces to imply real students would be a claim we cannot back. */
function AvatarStack() {
  const people = [
    { initials: "HT", tone: acc },
    { initials: "PN", tone: acc2 },
    { initials: "OS", tone: acc3 },
  ];

  return (
    <span className="flex -space-x-2" aria-hidden="true">
      {people.map((person) => (
        <span
          key={person.initials}
          className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold ring-2 ring-[var(--glass-2)]"
          style={{ background: person.tone(0.18), color: person.tone() }}
        >
          {person.initials}
        </span>
      ))}
    </span>
  );
}

/* The right-hand scene.

   `/hero-desk.jpg` is the photograph from the design and is not in the repo
   yet; until it is dropped into public/, the warm gradient and paper texture
   below carry the panel on their own. Everything layered on top — the plan
   card, the notebook, the margin notes — is drawn, so the composition reads
   as finished either way. */
function DeskScene() {
  return (
    <div className="relative">
      <div
        className="relative aspect-[4/3] w-full overflow-hidden rounded-[28px] sm:aspect-[5/4]"
        style={{
          backgroundColor: "#efe6d8",
          backgroundImage: `
            url(/hero-desk.jpg),
            radial-gradient(60% 60% at 78% 22%, rgb(255 250 240 / 0.95), transparent 70%),
            radial-gradient(70% 70% at 20% 85%, rgb(214 196 172 / 0.75), transparent 70%),
            linear-gradient(150deg, #f6ede0 0%, #e8dbc8 55%, #d9c9b2 100%)
          `,
          backgroundSize: "cover",
          backgroundPosition: "center",
          boxShadow: "var(--shadow)",
        }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        <NotebookPage />
      </div>

      {/* Float applies a transform, which makes it the containing block for
          any absolutely positioned child. So the placement lives on this
          wrapper and the card itself stays in normal flow inside it. */}
      <div className="absolute left-[5%] right-[7%] top-[9%] z-20">
        <Float amplitude={5} duration={9}>
          <PlanCard />
        </Float>
      </div>

      <Note className="-top-3 left-0 z-30 sm:left-2" rotate={-6} delay={0.5}>
        Focus on what
        <br />
        actually matters
      </Note>
      <CurvedArrow
        className="left-[150px] top-6 z-30 h-[84px] w-[64px] sm:left-[190px]"
        delay={0.85}
      />

      <Note
        className="bottom-8 right-2 z-30 text-right sm:bottom-12 sm:right-6"
        rotate={-3}
        colour={acc(0.9)}
        delay={0.9}
      >
        Small steps
        <br />
        big results
      </Note>
      <Star className="bottom-[30%] right-[26%] z-30 h-7 w-7" />
    </div>
  );
}

/* The lined page in the lower third, with the to-do list in marker pen. */
function NotebookPage() {
  return (
    <div
      className="absolute -bottom-2 left-[6%] right-[10%] h-[46%] rotate-[-2deg] rounded-t-xl bg-[#fdfbf6] shadow-[0_-8px_30px_-12px_rgba(60,45,25,0.35)]"
      style={{
        backgroundImage:
          "repeating-linear-gradient(rgba(20,32,58,0.09) 0 1px, transparent 1px 30px)",
        backgroundPositionY: "42px",
      }}
    >
      {/* The spiral binding along the top edge. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-6 top-0 flex justify-between"
      >
        {Array.from({ length: 14 }, (_, index) => (
          <span
            key={index}
            className="h-3 w-1.5 -translate-y-1 rounded-full bg-[#c9bda8]"
          />
        ))}
      </div>

      <div className="px-7 pt-8 sm:px-9">
        <p
          className="font-hand text-[1.3rem] font-bold sm:text-[1.5rem]"
          style={{ color: "#2b3a5c" }}
        >
          {HERO.notebook.title}
        </p>
        <ul className="mt-1 space-y-0.5">
          {HERO.notebook.items.map((item) => (
            <li
              key={item}
              className="font-hand flex items-center gap-2 text-[1.15rem] sm:text-[1.35rem]"
              style={{ color: "#2b3a5c" }}
            >
              <Check className="h-4 w-4 shrink-0" strokeWidth={3} />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* The floating product card, overlapping the photo's top edge. */
function PlanCard() {
  const { panel } = HERO;
  /* The sample tasks name real chapters, so they follow the toggle: an NCERT
     chapter number means nothing to a parent in Ohio. */
  const [country] = useCountry();
  const tasks = REGION[country].planTasks;

  return (
    <div
      className="rounded-2xl bg-white/95 p-5 backdrop-blur-sm sm:p-6"
      style={{
        border: "1px solid rgb(20 32 58 / 0.08)",
        boxShadow: "0 30px 60px -28px rgb(30 25 15 / 0.45)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className="text-[12px] font-bold uppercase tracking-[0.12em]"
          style={{ color: "#14203a" }}
        >
          {panel.title}
        </p>
        <span className="text-[13px] font-semibold" style={{ color: acc() }}>
          {panel.action}
        </span>
      </div>

      <div className="mt-4 h-[6px] overflow-hidden rounded-full bg-[rgb(20_32_58_/_0.09)]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${panel.progress}%`,
            background: `linear-gradient(90deg, ${acc()}, ${acc(0.65)})`,
          }}
        />
      </div>
      <p
        className="mt-2 text-right text-[11.5px]"
        style={{ color: "rgb(20 32 58 / 0.5)" }}
      >
        {panel.progressLabel}
      </p>

      <ul className="mt-3 space-y-0.5">
        {tasks.map((task) => (
          <li key={task.label}>
            <TaskRow label={task.label} state={task.state} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaskRow({
  label,
  state,
}: {
  label: string;
  state: "done" | "active" | "todo";
}) {
  const done = state === "done";

  return (
    <div
      className="flex items-center gap-3 rounded-lg px-2 py-1.5"
      style={
        state === "active"
          ? { background: "rgb(29 92 255 / 0.06)" }
          : undefined
      }
    >
      <span
        className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[4px]"
        style={{
          background: done ? acc() : "transparent",
          border: `1.5px solid ${done ? acc() : "rgb(20 32 58 / 0.22)"}`,
        }}
      >
        {done && <Check className="h-3 w-3 text-white" strokeWidth={3.5} />}
      </span>
      <span
        className="truncate text-[13.5px]"
        style={{ color: done ? "rgb(20 32 58 / 0.55)" : "#14203a" }}
      >
        {label}
      </span>
    </div>
  );
}
