"use client";

import {
  Accessibility,
  Camera,
  Check,
  ClipboardCheck,
  NotebookPen,
  PenLine,
  Repeat2,
  Route,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

import { RevealItem, useStillness } from "@/components/Reveal";
import { CurvedArrow, Note, Star, Underline } from "@/components/doodles";
import {
  AnimatedBars,
  DrawnPath,
  ProgressRing,
  PulseGrid,
  Spotlight,
} from "@/components/motion";
import {
  GlassCard,
  IconTile,
  Mesh,
  SectionHeading,
  toneColor,
} from "@/components/primitives";
import { acc, acc2 } from "@/lib/theme";
import {
  BENTO_SECTION,
  BENTO_TILES,
  type BentoIcon,
  type BentoTile,
} from "@/lib/content";
import { text } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICONS: Record<BentoIcon, LucideIcon> = {
  route: Route,
  clipboard: ClipboardCheck,
  camera: Camera,
  repeat: Repeat2,
  notebook: NotebookPen,
  timer: Timer,
  pen: PenLine,
  accessibility: Accessibility,
};

type Tone = "acc" | "acc2" | "acc3";

export function Bento() {
  return (
    <section id="features" className="relative overflow-hidden py-20 sm:py-24 lg:py-28">
      <Mesh variant="soft" />
      <DeskBleed />

      <div className="relative z-10 mx-auto max-w-[1180px] px-5 sm:px-6">
        <div className="relative">
          <SectionHeading
            eyebrow={BENTO_SECTION.eyebrow}
            heading={
              <>
                One place for every part of{" "}
                <span className="relative inline-block whitespace-nowrap pb-2">
                  revision
                  <Underline className="inset-x-0 bottom-0 h-3 w-full" delay={0.4} />
                </span>
              </>
            }
            sub={BENTO_SECTION.sub}
          />
          <Star className="-top-3 right-[18%] h-6 w-6 sm:right-[26%]" />
        </div>

        {/* On wide screens the grid steps right so the desk can sit in the
            freed gutter. The margin notes live at this level rather than
            inside a tile, because a tile clips its own overflow. */}
        <div className="relative mt-12 xl:pl-[228px]">
          <LeftGutter />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BENTO_TILES.map((tile, index) => (
              <RevealItem key={tile.id} index={index} className={tile.span}>
                <Spotlight className="h-full" tone={tile.accent}>
                  <Tile tile={tile} />
                </Spotlight>
              </RevealItem>
            ))}
          </div>

          <MarginNotes />
        </div>
      </div>
    </section>
  );
}

/* The desk column: an optional photograph behind a drawn revision plan, plus
   the note that introduces the grid. */
function LeftGutter() {
  const items = [
    { label: "Understand", done: true },
    { label: "Practice", done: true },
    { label: "Recall", done: false },
    { label: "Improve", done: false },
  ];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 hidden h-full w-[228px] xl:block"
    >
      <Note className="left-[108px] top-1 w-[104px] text-[1.1rem]" rotate={-4} delay={0.5}>
        Everything
        <br />
        you need,
        <br />
        in one place
      </Note>
      <CurvedArrow className="left-[132px] top-[92px] h-[58px] w-[50px]" delay={0.9} />

      <div className="absolute left-[-84px] top-[178px] w-[240px] rotate-[-4deg]">
        <div
          className="rounded-sm bg-[#fdfbf6] px-6 py-5 shadow-[0_18px_44px_-20px_rgba(60,45,25,0.5)]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(rgba(20,32,58,0.08) 0 1px, transparent 1px 28px)",
            backgroundPositionY: "36px",
          }}
        >
          <p
            className="font-hand text-[1.35rem] font-bold"
            style={{ color: "#2b3a5c" }}
          >
            Revision plan
          </p>
          <span
            className="mt-0.5 block h-px w-28"
            style={{ background: "rgb(20 32 58 / 0.25)" }}
          />

          <ul className="mt-3 space-y-1.5">
            {items.map((item) => (
              <li
                key={item.label}
                className="font-hand flex items-center gap-2 text-[1.1rem]"
                style={{ color: "#2b3a5c" }}
              >
                <span
                  className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[3px] border-[1.5px]"
                  style={{ borderColor: "rgb(20 32 58 / 0.45)" }}
                >
                  {item.done && (
                    <Check
                      className="h-2.5 w-2.5"
                      strokeWidth={3.5}
                      style={{ color: "#2b3a5c" }}
                    />
                  )}
                </span>
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* Notes that sit in the gaps between tiles, pointing at the detail each one
   is about. Percentages are tuned against the lg grid. */
function MarginNotes() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden xl:block"
    >
      {/* Offsets are in pixels, anchored to the top of the grid, so both notes
          stay beside the first row whatever the tiles below do. */}
      <div className="absolute right-[-124px] top-[352px] w-[126px]">
        <CurvedArrow
          className="left-[-6px] top-[-34px] h-[44px] w-[40px] -scale-x-100"
          colour={acc(0.8)}
          delay={0.9}
        />
        <Note
          className="static text-[1rem]"
          rotate={-2}
          colour={acc(0.9)}
          delay={0.6}
        >
          See exactly
          <br />
          where marks
          <br />
          were lost
        </Note>
      </div>
    </div>
  );
}

/* The photograph bleeding in from the left edge on wide screens, faded out
   towards the content. `/hero-desk.jpg` is reused, so dropping in that one
   file dresses both the hero and this section; without it nothing shows and
   the drawn notebook carries the gutter on its own. */
function DeskBleed() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 hidden w-[320px] xl:block"
      style={{
        backgroundImage: "url(/hero-desk.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "right center",
        maskImage:
          "linear-gradient(to right, #000 0%, rgb(0 0 0 / 0.75) 45%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to right, #000 0%, rgb(0 0 0 / 0.75) 45%, transparent 100%)",
      }}
    />
  );
}

function Tile({ tile }: { tile: BentoTile }) {
  const Icon = ICONS[tile.icon];
  const large = tile.featured === true;

  return (
    <GlassCard hover className="flex h-full flex-col p-6 sm:p-7">
      <div className="flex items-center gap-3">
        <IconTile tone={tile.accent}>
          <Icon className="h-[19px] w-[19px]" />
        </IconTile>
        <span
          className="text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: text(0.45) }}
        >
          {tile.eyebrow}
        </span>
      </div>

      <h3
        className={`font-display mt-5 font-extrabold tracking-[-0.02em] ${
          large ? "text-[1.65rem] leading-[1.15]" : "text-[1.25rem] leading-[1.2]"
        }`}
        style={{ color: text() }}
      >
        {tile.title}
      </h3>

      <p
        className="mt-3 text-[14px] leading-[1.65] sm:text-[15px]"
        style={{ color: text(0.6) }}
      >
        {tile.body}
      </p>

      {tile.visual !== "none" && (
        <div className="mt-auto pt-6">
          <Visual kind={tile.visual} tone={tile.accent} />
        </div>
      )}
    </GlassCard>
  );
}

function Visual({ kind, tone }: { kind: BentoTile["visual"]; tone: Tone }) {
  if (kind === "roadmap") return <RoadmapVisual tone={tone} />;
  if (kind === "marking") return <MarkingVisual tone={tone} />;
  if (kind === "photo") return <PhotoVisual tone={tone} />;
  if (kind === "heatmap") return <HeatmapVisual tone={tone} />;
  if (kind === "notes") return <NotesVisual tone={tone} />;
  if (kind === "focus") return <FocusVisual tone={tone} />;
  return null;
}

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-2xl p-4", className)}
      style={{ background: text(0.04), border: "1px solid var(--line)" }}
    >
      {children}
    </div>
  );
}

/* The weekly plan, with a line drawing itself down the left as the rows
   arrive one after another. */
function RoadmapVisual({ tone }: { tone: Tone }) {
  const c = toneColor(tone);
  const still = useStillness();

  const days = [
    { day: "Mon", topic: "Entropy basics", done: true },
    { day: "Tue", topic: "Rates of reaction", done: true },
    { day: "Wed", topic: "Mock — Unit 4", done: false, now: true },
    { day: "Thu", topic: "Electrolysis recall", done: false },
    { day: "Fri", topic: "Weak-topic sweep", done: false },
  ];

  return (
    <Panel>
      <div className="relative pl-6">
        <svg
          className="absolute left-[7px] top-2 h-[calc(100%-1rem)] w-2"
          viewBox="0 0 2 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <DrawnPath d="M1 0 L1 100" stroke={c(0.45)} strokeWidth={2} duration={1.5} />
        </svg>

        {/* Sits in the empty right half of the panel, pointing back at the
            row the plan has moved you onto. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-1 top-5 hidden w-[118px] xl:block"
        >
          <Note className="static text-[0.98rem]" rotate={-3} delay={0.7}>
            Focus moves
            <br />
            with you
          </Note>
          <CurvedArrow
            className="left-[-2px] top-[38px] h-[42px] w-[38px] -scale-x-100"
            colour={acc2(0.85)}
            delay={1}
          />
        </div>

        <ul className="space-y-2">
          {days.map((entry, index) => (
            <motion.li
              key={entry.day}
              className="relative flex items-center gap-3 rounded-xl px-3 py-2"
              style={
                entry.now
                  ? { background: c(0.14), border: `1px solid ${c(0.3)}` }
                  : undefined
              }
              initial={still ? false : { opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{
                duration: still ? 0 : 0.45,
                delay: still ? 0 : 0.25 + index * 0.12,
              }}
            >
              <span
                aria-hidden="true"
                className="absolute -left-[22px] h-2 w-2 rounded-full"
                style={{
                  background: entry.done ? c(0.5) : c(),
                  boxShadow: entry.now ? `0 0 0 4px ${c(0.18)}` : undefined,
                }}
              />
              <span
                className="w-9 shrink-0 text-[11px] font-bold uppercase tracking-[0.1em]"
                style={{ color: text(0.4) }}
              >
                {entry.day}
              </span>
              <span
                className="truncate text-[13.5px]"
                style={{
                  color: entry.done ? text(0.4) : text(0.85),
                  textDecoration: entry.done ? "line-through" : undefined,
                }}
              >
                {entry.topic}
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

function MarkingVisual({ tone }: { tone: Tone }) {
  const c = toneColor(tone);

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <span className="text-[12px]" style={{ color: text(0.5) }}>
          Paper 2 · 20 marks
        </span>
        <span
          className="rounded-full px-2.5 py-1 text-[12px] font-bold"
          style={{ background: c(0.18), color: c() }}
        >
          18 / 20
        </span>
      </div>
      <div className="mt-3">
        <AnimatedBars total={20} scored={18} colour={c(0.65)} />
      </div>
      <p className="mt-3 text-[12.5px]" style={{ color: text(0.5) }}>
        Two marks lost to missing units — flagged in the board&apos;s wording.
      </p>
    </Panel>
  );
}

/* A shutter sweeping across the frame, then the explanation filling in. */
function PhotoVisual({ tone }: { tone: Tone }) {
  const c = toneColor(tone);
  const still = useStillness();

  return (
    <Panel>
      <div
        className="relative flex h-20 items-center justify-center overflow-hidden rounded-xl"
        style={{ background: text(0.06) }}
      >
        <Camera className="h-6 w-6" style={{ color: text(0.28) }} />
        {!still && (
          <motion.span
            aria-hidden="true"
            className="absolute inset-y-0 w-1/3"
            style={{
              background: `linear-gradient(90deg, transparent, ${c(0.35)}, transparent)`,
            }}
            animate={{ x: ["-120%", "320%"] }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              repeatDelay: 1.6,
              ease: "easeInOut",
            }}
          />
        )}
      </div>
      <div className="mt-3 space-y-1.5">
        {[1, 0.8, 0.6].map((width, index) => (
          <motion.div
            key={index}
            className="h-1.5 rounded-full"
            style={{ background: index === 0 ? c(0.5) : text(0.1) }}
            initial={still ? { width: `${width * 100}%` } : { width: 0 }}
            whileInView={{ width: `${width * 100}%` }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{
              duration: still ? 0 : 0.7,
              delay: still ? 0 : 0.2 + index * 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        ))}
      </div>
    </Panel>
  );
}

function HeatmapVisual({ tone }: { tone: Tone }) {
  const c = toneColor(tone);

  return (
    <Panel>
      <PulseGrid
        cells={21}
        active={new Set([1, 6, 8, 12, 17, 19])}
        colour={c(0.75)}
      />
      <p className="mt-3 text-[12.5px]" style={{ color: text(0.5) }}>
        Electrolysis is due for review
      </p>
    </Panel>
  );
}

function NotesVisual({ tone }: { tone: Tone }) {
  const c = toneColor(tone);
  const still = useStillness();

  return (
    <Panel>
      <div className="flex items-center gap-2">
        <span
          className="rounded-md px-2 py-0.5 text-[11px] font-bold"
          style={{ background: c(0.18), color: c() }}
        >
          4.3
        </span>
        <span className="text-[12.5px]" style={{ color: text(0.6) }}>
          Le Chatelier&apos;s principle
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        {[1, 0.92, 0.75, 0.5].map((width, index) => (
          <motion.div
            key={index}
            className="h-1.5 rounded-full"
            style={{ background: index === 3 ? c(0.45) : text(0.12) }}
            initial={still ? { width: `${width * 100}%` } : { width: 0 }}
            whileInView={{ width: `${width * 100}%` }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{
              duration: still ? 0 : 0.6,
              delay: still ? 0 : index * 0.12,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        ))}
      </div>
    </Panel>
  );
}

function FocusVisual({ tone }: { tone: Tone }) {
  const c = toneColor(tone);

  return (
    <Panel>
      <div className="flex items-center gap-4">
        <ProgressRing size={56} progress={0.7} colour={c()} track={text(0.12)} />
        <div>
          <p className="text-[15px] font-bold" style={{ color: text() }}>
            25:00
          </p>
          <p className="mt-0.5 text-[12.5px]" style={{ color: text(0.5) }}>
            Lo-fi focus playlist
          </p>
        </div>
      </div>
    </Panel>
  );
}
