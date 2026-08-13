/* The symbolic checker, and what happens when it is not there.
 *
 * lib/math/verify.ts handles rational arithmetic exactly and returns null for
 * anything else. That covers nearly all of Class 8. Class 9 and 10 bring
 * factorisation, roots and identities, which cannot be checked by evaluating
 * numbers — so those go to the SymPy service in services/math-verify.
 *
 * ---------------------------------------------------------------------------
 * DEGRADING, NOT FAILING
 *
 * If the service is down, unset, or slow, this returns "unknown" and the tutor
 * carries on with the exact-fraction checker alone. A maths verifier that takes
 * the lesson down when it cannot reach a helper is worse than no verifier: the
 * student loses the whole session over a claim that was probably fine.
 *
 * The three-state return is the important part. `false` means the service
 * checked and the claim is wrong; `null` means nobody knows. A caller that
 * treats null as false has the tutor apologising for correct algebra, which is
 * a worse failure than missing a wrong sum. */

import "server-only";

import { auditEquations } from "@/lib/math/verify";

export type SymbolicVerdict = {
  /* true = checked and correct, false = checked and wrong, null = unknown. */
  correct: boolean | null;
  source: "exact" | "symbolic" | "unavailable";
  reason?: string;
};

const TIMEOUT_MS = Number(process.env.MATH_VERIFY_TIMEOUT_MS ?? 2500);

export function symbolicConfigured() {
  return Boolean(process.env.MATH_VERIFY_URL);
}

/* One claimed equality, as the tutor wrote it: "x^2-5x+6 = (x-2)(x-3)". */
export async function checkClaim(claim: string): Promise<SymbolicVerdict> {
  /* The exact checker first: it is free, instant, and right about the case it
     covers. A call to the service for "1/3 + 1/6 = 1/2" would be latency spent
     on a question already answered. */
  const exact = auditEquations(claim);
  if (exact.length > 0) {
    return { correct: false, source: "exact", reason: `actually ${exact[0].actual}` };
  }

  const base = process.env.MATH_VERIFY_URL;
  if (!base) return { correct: null, source: "unavailable", reason: "MATH_VERIFY_URL not set" };

  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim: claim.slice(0, 500) }),
      /* A hard ceiling. The tutor's reply is already written and waiting on
         this; two and a half seconds of verification is the most a student
         should ever pay for a check that usually returns in milliseconds. */
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      return { correct: null, source: "unavailable", reason: `HTTP ${response.status}` };
    }

    const payload = (await response.json()) as { equal: boolean | null; reason?: string };

    return {
      correct: payload.equal,
      source: payload.equal === null ? "unavailable" : "symbolic",
      reason: payload.reason,
    };
  } catch (error) {
    return {
      correct: null,
      source: "unavailable",
      reason: error instanceof Error ? error.message : "unreachable",
    };
  }
}

/* Every equality in a tutor reply, checked. Returns only the ones known to be
   wrong — an unverifiable claim produces nothing, which is what keeps the
   tutor quiet rather than wrong.

   Bounded at eight claims: a reply with more than that is a worked example,
   the checks are sequential against one service, and the student is waiting. */
export async function auditReply(
  text: string,
): Promise<{ claim: string; detail: string; source: string }[]> {
  const exact = auditEquations(text).map((bad) => ({
    claim: bad.claim,
    detail: `actually ${bad.actual}`,
    source: "exact",
  }));

  if (!symbolicConfigured()) return exact;

  const claims = extractClaims(text)
    .filter((claim) => !exact.some((bad) => claim.includes(bad.claim)))
    .slice(0, 8);

  const wrong = [...exact];

  for (const claim of claims) {
    const verdict = await checkClaim(claim);
    if (verdict.correct === false) {
      wrong.push({ claim, detail: verdict.reason ?? "does not hold", source: verdict.source });
    }
  }

  return wrong;
}

/* Only equalities inside $...$. Bare prose arithmetic is left to the exact
   checker: sending prose to a symbolic parser produces confident nonsense
   about sentences that were never equations. */
function extractClaims(text: string): string[] {
  const claims: string[] = [];

  for (const match of text.matchAll(/\$([^$]+)\$/g)) {
    const body = match[1].trim();
    if (body.includes("=") && body.length < 400) claims.push(body);
  }

  return claims;
}
