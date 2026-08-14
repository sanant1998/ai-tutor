"use client";

/* Which country's school system the visitor is in, chosen before there is an
   account to hang it on.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ITS OWN MODULE
 *
 * The same fact lives in OnboardingState.countryId, and the obvious move is to
 * read and write it there. But lib/onboarding.ts pulls in lib/syllabus.ts, and
 * lib/syllabus.ts carries every sourced chapter list in the product — a header
 * control on a marketing page has no business shipping the NCERT Class 10
 * Science contents to read one preference.
 *
 * So the landing page writes here, and lib/onboarding.ts reads here as a
 * fallback when there is no answer of its own yet. The dependency points one
 * way: this file imports nothing.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A FALLBACK RATHER THAN THE SOURCE
 *
 * Once a board has been chosen, the board decides the country — a board
 * belongs to exactly one. A visitor who taps "United States" in the header and
 * then signs in as a CBSE student is a CBSE student, not an American one, and
 * this value must not be able to argue with that. It only answers the question
 * for someone who has not answered it any other way. */

import type { CountryId } from "@/lib/syllabus";

export type { CountryId };

export const COUNTRY_STORAGE_KEY = "mmr-country";

/* Duplicated from lib/syllabus.ts rather than imported, because importing it
   is the whole thing this module exists to avoid. Kept in step by the type
   above: widening CountryId without adding it here fails the build. */
const VALID: Record<CountryId, true> = { in: true, us: true };

export const FALLBACK_COUNTRY: CountryId = "in";

/* Fired on every write so a control in the header and a section far down the
   page never disagree about what was just tapped. `storage` is not enough: the
   browser does not deliver it to the tab that made the change. */
export const COUNTRY_EVENT = "mmr:country";

export function readStoredCountry(): CountryId | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(COUNTRY_STORAGE_KEY);
    return raw && raw in VALID ? (raw as CountryId) : null;
  } catch {
    /* Private browsing. Treated as "not answered", which is the truth. */
    return null;
  }
}

export function writeStoredCountry(country: CountryId) {
  try {
    window.localStorage.setItem(COUNTRY_STORAGE_KEY, country);
  } catch {
    /* The choice still applies to this page — it just will not outlive it. */
  }

  window.dispatchEvent(new CustomEvent(COUNTRY_EVENT, { detail: country }));
}
