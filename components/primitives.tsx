import { cn } from "@/lib/utils";
import { acc, acc2, acc3, text } from "@/lib/theme";

/* A soft gradient wash used behind sections. Three offset radial blooms in
   the theme's accent colours, blurred into each other; opacity is driven by
   the theme token so light themes stay subtle and dark themes glow.
   Hidden entirely in calm mode via `.mesh` in globals.css. */
export function Mesh({
  className,
  variant = "hero",
}: {
  className?: string;
  variant?: "hero" | "soft" | "center";
}) {
  const blooms =
    variant === "center"
      ? [
          { c: acc(0.5), pos: "50% 50%", size: "60% 60%" },
          { c: acc2(0.35), pos: "30% 40%", size: "45% 45%" },
          { c: acc3(0.25), pos: "72% 60%", size: "40% 40%" },
        ]
      : variant === "soft"
        ? [
            { c: acc(0.28), pos: "18% 0%", size: "55% 55%" },
            { c: acc2(0.22), pos: "85% 25%", size: "45% 50%" },
            { c: acc3(0.14), pos: "50% 100%", size: "60% 40%" },
          ]
        : [
            { c: acc(0.55), pos: "78% 8%", size: "52% 58%" },
            { c: acc2(0.4), pos: "12% 22%", size: "48% 52%" },
            { c: acc3(0.24), pos: "55% 78%", size: "55% 45%" },
          ];

  return (
    <div
      aria-hidden="true"
      className={cn("mesh pointer-events-none absolute inset-0", className)}
      style={{
        opacity: "var(--mesh-opacity)",
        filter: "blur(60px)",
        backgroundImage: blooms
          .map((b) => `radial-gradient(${b.size} at ${b.pos}, ${b.c}, transparent 70%)`)
          .join(", "),
      }}
    />
  );
}

/* Small uppercase kicker above a section heading. */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] glass",
        className,
      )}
      style={{ color: text(0.75) }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: acc() }}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  heading,
  sub,
  align = "center",
  className,
}: {
  eyebrow: string;
  heading: React.ReactNode;
  sub?: string;
  align?: "center" | "left";
  className?: string;
}) {
  const centered = align === "center";

  return (
    <div className={cn(centered && "text-center", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        className="font-display mt-5 text-[2rem] sm:text-[2.6rem] lg:text-[3rem] font-extrabold leading-[1.1] tracking-[-0.03em]"
        style={{ color: text() }}
      >
        {heading}
      </h2>
      {sub && (
        <p
          className={cn(
            "mt-4 text-[16px] sm:text-[17px] leading-[1.65] max-w-2xl",
            centered && "mx-auto",
          )}
          style={{ color: text(0.62) }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

/* The standard translucent panel. `sheen` adds the hairline of light along
   the top edge that keeps it from reading as a flat grey box. */
export function GlassCard({
  children,
  className,
  strong = false,
  sheen = true,
  hover = false,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  strong?: boolean;
  sheen?: boolean;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl",
        strong ? "glass-strong" : "glass",
        sheen && "glass-sheen",
        hover && "lift",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* Rounded square that holds a section or tile icon. */
export function IconTile({
  children,
  tone = "acc",
  className,
}: {
  children: React.ReactNode;
  tone?: "acc" | "acc2" | "acc3";
  className?: string;
}) {
  const colour = tone === "acc" ? acc : tone === "acc2" ? acc2 : acc3;

  return (
    <div
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
        className,
      )}
      style={{
        background: colour(0.14),
        border: `1px solid ${colour(0.28)}`,
        color: colour(),
      }}
    >
      {children}
    </div>
  );
}

export function toneColor(tone: "acc" | "acc2" | "acc3") {
  return tone === "acc" ? acc : tone === "acc2" ? acc2 : acc3;
}
