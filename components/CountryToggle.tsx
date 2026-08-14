"use client";

/* India or the United States, on the marketing site.
 *
 * The same question onboarding asks, asked earlier. A visitor who taps it here
 * arrives at step one with it already answered — see readOnboarding() in
 * lib/onboarding.ts, which reads this as its fallback.
 *
 * It is a visible pair of options rather than a dropdown or a detected guess.
 * There are two, the choice changes what the page below claims to support, and
 * a region switcher a visitor cannot see is one they cannot correct. */

import { useCallback, useSyncExternalStore } from "react";

import {
  COUNTRY_EVENT,
  FALLBACK_COUNTRY,
  readStoredCountry,
  writeStoredCountry,
  type CountryId,
} from "@/lib/country";
import { acc, text } from "@/lib/theme";

const OPTIONS: { id: CountryId; label: string; short: string }[] = [
  { id: "in", label: "India", short: "IN" },
  { id: "us", label: "United States", short: "US" },
];

/* localStorage is an external store, so this is useSyncExternalStore rather
   than a read into state inside an effect. Two things fall out of that: React
   renders the server snapshot during hydration and swaps in the real answer
   straight after — no mismatch to suppress — and every mounted copy of this
   hook, in the header and far down the page, moves on the same tick.

   `storage` is subscribed to as well as our own event, which the browser fires
   only in OTHER tabs. Two tabs open on the marketing site now agree. */
function subscribe(onChange: () => void) {
  window.addEventListener(COUNTRY_EVENT, onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(COUNTRY_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/* A primitive, so React's identity check compares it by value and a re-read
   that finds the same answer does not cause a render. */
function snapshot(): CountryId {
  return readStoredCountry() ?? FALLBACK_COUNTRY;
}

function serverSnapshot(): CountryId {
  return FALLBACK_COUNTRY;
}

export function useCountry(): [CountryId, (next: CountryId) => void] {
  const country = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  /* Writes to the store and lets the subscription above bring the state back,
     so the clicked control takes the same path as every other listener. */
  const choose = useCallback((next: CountryId) => writeStoredCountry(next), []);

  return [country, choose];
}

export function CountryToggle({ full = false }: { full?: boolean }) {
  const [country, choose] = useCountry();

  return (
    <div
      role="radiogroup"
      aria-label="Country"
      className={`flex shrink-0 items-center gap-0.5 rounded-full p-0.5 ${full ? "w-full" : ""}`}
      style={{ background: text(0.06) }}
    >
      {OPTIONS.map((option) => {
        const active = option.id === country;

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            onClick={() => choose(option.id)}
            className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
              full ? "flex-1" : ""
            }`}
            style={{
              background: active ? acc(0.18) : "transparent",
              color: text(active ? 0.95 : 0.55),
            }}
          >
            {/* "United States" spelled out where there is room for it — the
                mobile sheet, and onboarding. The header is a row of six
                controls on one line, so it gets the two-letter code and the
                aria-label above carries the real name for a screen reader. */}
            {full ? option.label : option.short}
          </button>
        );
      })}
    </div>
  );
}
