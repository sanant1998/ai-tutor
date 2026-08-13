/* Per-IP limits on the endpoints that cost money before an account has proved
   anything.

   ---------------------------------------------------------------------------
   WHAT THIS IS FOR

   The daily quota in lib/ai/quota.ts caps what one ACCOUNT can spend. Accounts
   are free, so it does not cap what one person can spend — sign up, burn the
   free turns, sign up again. This adds the second axis.

   ---------------------------------------------------------------------------
   IT FAILS OPEN, DELIBERATELY

   If the rate-limit table is missing or the database is briefly unreachable,
   requests are allowed. That is the opposite of the consent gate, which fails
   closed, and the reasoning is the difference in what being wrong costs:

     consent   being wrong means processing a child's data unlawfully.
     limits    being wrong means a locked-out student who did nothing.

   Behind this there is still a per-account daily quota and a hard turn ceiling
   per session, so a failure here is not an unbounded spend — it is one more
   layer being briefly absent.

   ---------------------------------------------------------------------------
   AN IP IS BLUNT IN INDIA

   A school, a housing society or a carrier's CGNAT can put hundreds of real
   students behind one address. The limits below are shaped to stop a script,
   not to ration a computer lab. If they ever fire on a real classroom, they
   are too tight. */

import "server-only";

import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export type LimitAction =
  | "consent_request"
  | "tutor_turn"
  | "practice_attempt"
  | "signup"
  | "audio"
  | "analytics";

type Rule = { limit: number; windowSeconds: number };

const RULES: Record<LimitAction, Rule> = {
  /* Sending an SMS or a WhatsApp costs real money, and this endpoint is
     reachable by anyone with an account. Ten an hour from one address covers a
     family retrying twice and a small classroom setting up together. */
  consent_request: { limit: 10, windowSeconds: 3600 },

  /* The expensive one. 120 an hour is far above what a single student can
     produce — the session ceiling is 12 turns per concept — and far below what
     a script would want. */
  tutor_turn: { limit: 120, windowSeconds: 3600 },

  /* Marking a multiple-choice answer is free; marking a written one is not.
     Loose, because a classroom doing a worksheet together is the intended
     traffic. */
  practice_attempt: { limit: 600, windowSeconds: 3600 },

  signup: { limit: 20, windowSeconds: 3600 },

  /* Text-to-speech and speech-to-text. Their own bucket, because they used to
     share `practice_attempt` with the analytics beacon: a page emitting events
     normally could exhaust the allowance for a paid audio call, and a flood of
     free beacons could switch the audio feature off for a whole school's IP.
     Two things that cost completely different amounts do not belong in one
     counter. */
  audio: { limit: 200, windowSeconds: 3600 },

  /* The beacon. High, because a single active student legitimately emits
     dozens of events an hour and the endpoint stores nothing that costs
     anything — it is here to stop a script filling the table, not to ration
     ordinary use. */
  analytics: { limit: 1000, windowSeconds: 3600 },
};

export type LimitResult = {
  allowed: boolean;
  used: number;
  limit: number;
  resetsAt: string | null;
  /* True when the check could not run. Surfaced so a route can log it rather
     than silently believing it is protected. */
  degraded: boolean;
};

/* The caller's address, as far as it can be trusted.
 *
 * x-forwarded-for is client-settable in general; behind Vercel, Cloudflare or
 * an nginx that sets it, the FIRST entry is the real client and the rest are
 * proxies. Deployed anywhere that does not overwrite the header, this is
 * spoofable — which is worth knowing rather than assuming away, and is another
 * reason the per-account quota is the real limit. */
export function callerIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();

  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function takeLimit(
  action: LimitAction,
  subject: string,
): Promise<LimitResult> {
  const rule = RULES[action];

  if (!isAdminConfigured() || !subject || subject === "unknown") {
    return { allowed: true, used: 0, limit: rule.limit, resetsAt: null, degraded: true };
  }

  try {
    const { data, error } = await createAdminClient().rpc("take_rate_limit", {
      p_action: action,
      p_subject: subject,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });

    if (error) {
      /* Once, loudly. The commonest cause is that supabase/ratelimit.sql has
         not been run, and a silent no-op would leave someone believing the
         limit is in place. */
      console.warn(`[ratelimit] ${action} check unavailable: ${error.message}`);
      return { allowed: true, used: 0, limit: rule.limit, resetsAt: null, degraded: true };
    }

    const row = Array.isArray(data) ? data[0] : data;

    return {
      allowed: row?.allowed !== false,
      used: Number(row?.used ?? 0),
      limit: rule.limit,
      resetsAt: (row?.resets_at as string | undefined) ?? null,
      degraded: false,
    };
  } catch (error) {
    console.warn(`[ratelimit] ${action} check failed`, error);
    return { allowed: true, used: 0, limit: rule.limit, resetsAt: null, degraded: true };
  }
}

/* The message a limited caller sees. Never mentions the limit or the window —
   a number tells a script exactly how long to wait, and tells a genuine
   student nothing they can act on. */
export const LIMIT_MESSAGE =
  "Too many requests just now. Try again in a little while.";
