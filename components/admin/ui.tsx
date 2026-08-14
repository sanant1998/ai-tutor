/* The admin panel's form furniture.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE EXIST
 *
 * The consoles were built as raw inputs with placeholder text doing the work of
 * labels. That reads fine while you are the person who wrote it and badly
 * everywhere else: a placeholder disappears the moment somebody types, so a
 * half-filled form is a row of boxes with no idea what any of them are, and a
 * date input shows `dd-mm-yyyy` whether or not it is the licence start or the
 * licence end. Every field here carries a real <label>.
 *
 * ---------------------------------------------------------------------------
 * LITERAL COLOURS, NO `dark:` VARIANTS
 *
 * The admin area is pinned light by `.admin-light` in globals.css, which exists
 * because the older consoles carry sixty inline `dark:` utilities that fight
 * it. New admin UI does not add to that pile.
 *
 * That same rule sets background, colour and border-colour on every input,
 * select and textarea with `!important` — so a focus style written as a border
 * colour here would silently lose. The focus state is a box-shadow ring for
 * exactly that reason, and controls below deliberately do not set a border
 * colour at all: the global rule owns it, and two owners would mean whichever
 * of them was edited last. */

import type { ReactNode } from "react";
import { AlertTriangle, Info as InfoIcon } from "lucide-react";

const CONTROL =
  "w-full rounded-lg px-3 py-2.5 text-[14px] outline-none transition-shadow " +
  "placeholder:text-[#667085] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)] " +
  "disabled:opacity-60";

/* One block of the console: a heading, an optional line explaining it, a white
   card of controls, and an optional note underneath.

   The note sits OUTSIDE the card on purpose. It is commentary on what the form
   does — "a half-created school looks exactly like a complete one" — not a
   field, and inside the card it reads as another row to fill in. */
export function Panel({
  title,
  sub,
  note,
  children,
}: {
  title: string;
  sub?: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[1.15rem] font-extrabold tracking-[-0.02em] text-[#0d1015]">{title}</h2>
      {sub && <p className="mt-1 text-[13.5px] text-[#4b5565]">{sub}</p>}

      <div className="mt-4 space-y-4 rounded-2xl border border-[#e9eaee] bg-white p-6">
        {children}
      </div>

      {note && <p className="mt-3 text-[12.5px] leading-[1.6] text-[#667085]">{note}</p>}
    </section>
  );
}

/* A row of fields. The count is the DESKTOP column count; everything stacks on
   a phone, because a four-column grid on a 390px screen is four unreadable
   columns rather than a compact form. */
export function Row({ cols = 2, children }: { cols?: 1 | 2 | 3 | 4; children: ReactNode }) {
  const at = {
    1: "",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }[cols];

  return <div className={`grid gap-4 ${at}`}>{children}</div>;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-semibold text-[#4b5565]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-[#667085]">{hint}</span>}
    </label>
  );
}

export function Input({
  mono,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input {...props} className={`${CONTROL} ${mono ? "font-mono text-[13px]" : ""} ${className}`} />;
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${CONTROL} cursor-pointer ${className}`}>
      {children}
    </select>
  );
}

export function Textarea({
  mono,
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  return (
    <textarea {...props} className={`${CONTROL} ${mono ? "font-mono text-[13px]" : ""} ${className}`} />
  );
}

export function Checkbox({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-[#14171c]">
      <input type="checkbox" {...props} className="h-4 w-4 cursor-pointer accent-[#2563eb]" />
      {label}
    </label>
  );
}

export function Action({
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={
        "inline-flex items-center gap-2 rounded-lg bg-[#2563eb] px-4 py-2.5 text-[14px] " +
        "font-semibold text-white transition-colors hover:bg-[#1d4ed8] " +
        `disabled:cursor-not-allowed disabled:opacity-45 ${className}`
      }
    >
      {children}
    </button>
  );
}

export function Quiet({
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={
        "inline-flex items-center gap-1.5 rounded-lg border border-[#dfe2e7] bg-white px-2.5 py-1.5 " +
        `text-[12.5px] font-semibold text-[#4b5565] transition-colors hover:bg-[#f5f6f8] disabled:opacity-45 ${className}`
      }
    >
      {children}
    </button>
  );
}

/* Something that will bite later. Amber rather than red because none of these
   are errors — the form still works, it is the consequence that is bad. */
export function Warn({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-lg border border-[#fde3b8] bg-[#fffbf3] px-4 py-3 text-[13px] leading-[1.55] text-[#b45309]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function Info({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[#d6e4ff] bg-[#f4f8ff] px-4 py-3 text-[13px] leading-[1.55] text-[#1e40af]">
      <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-2">{children}</div>
    </div>
  );
}
