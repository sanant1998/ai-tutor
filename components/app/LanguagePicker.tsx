"use client";

/* Which language the tutor teaches in.
 *
 * Placed on the tutor index rather than buried in Settings, because it is a
 * decision a student makes once and makes on the way into their first lesson —
 * and a setting nobody finds is a setting that does not exist.
 *
 * Each option is labelled in its own language. A student who cannot read the
 * label cannot choose the language, which is a small thing that decides
 * whether the Hindi option is usable by the people it is for. */

import { useEffect, useState } from "react";
import { Check, Languages, Loader2 } from "lucide-react";

import type { Language } from "@/lib/language";

/* Which edge the panel hangs from.
 *
 * It was always `right-0`, which is correct in the tutor header where the
 * trigger sits at the right of the screen — the panel opens leftwards into the
 * page. In Settings the same trigger sits at the LEFT of a card, and right-0
 * hung the panel off the left edge of the viewport, where a third of it was
 * clipped. Same component, opposite corner, so the caller says which. */
export function LanguagePicker({ align = "right" }: { align?: "left" | "right" } = {}) {
  const [options, setOptions] = useState<Language[]>([]);
  const [current, setCurrent] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;

    void fetch("/api/profile/language")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!live || !payload) return;
        setOptions(payload.options ?? []);
        setCurrent(payload.language ?? "");
      })
      .catch(() => {
        /* The tutor works without this. Showing nothing is better than an
           error a student cannot act on. */
      });

    return () => {
      live = false;
    };
  }, []);

  const choose = async (language: string) => {
    setBusy(true);

    try {
      const response = await fetch("/api/profile/language", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });

      if (response.ok) setCurrent(language);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  if (options.length === 0) return null;

  const chosen = options.find((option) => option.id === current) ?? options[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[14px]"
        style={{ background: "rgb(var(--text-rgb) / 0.06)" }}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Languages className="h-3.5 w-3.5" />
        )}
        {chosen.label}
      </button>

      {open && (
        <ul
          role="listbox"
          /* The theme's own surface and text, not bg-white plus a `dark:`
             variant. Tailwind has no darkMode configured, so `dark:` follows
             the OPERATING SYSTEM while the page's colours come from the token
             block in globals.css — and on an OS set to light with the app on a
             dark theme, this rendered near-white text on a white panel. The
             list was invisible. */
          className={`absolute ${align === "left" ? "left-0" : "right-0"} z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl shadow-lg`}
          style={{
            background: "var(--glass-2)",
            border: "1px solid var(--line-strong)",
            color: "var(--text)",
          }}
        >
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={option.id === current}
                onClick={() => void choose(option.id)}
                className="flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-[rgb(var(--text-rgb)/0.06)]"
              >
                <Check
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                    option.id === current ? "opacity-100" : "opacity-0"
                  }`}
                />
                <span>
                  <span className="block text-[14px] font-semibold">{option.label}</span>
                  <span className="mt-0.5 block text-[12px] opacity-60">{option.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
