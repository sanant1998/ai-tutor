/* Daily generation limits, per student.

   Without this a signed-in student can hold down Generate and spend real
   money. The count lives in Postgres and is taken through a security-definer
   function, so it is atomic and a client cannot reset its own usage.

   The guard fails CLOSED. If the usage table is missing, generation stops
   with a message naming the migration rather than quietly running unmetered —
   an unmetered spend bug is the expensive kind. */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ACTION_LABEL, LIMITS, type Action, type Plan } from "@/lib/plans";

export { LIMITS, type Action, type Plan };

export type Quota = { used: number; limit: number };

export async function planFor(
  supabase: SupabaseClient,
  userId: string,
): Promise<Plan> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();

    return data?.plan === "pro" ? "pro" : "free";
  } catch {
    return "free";
  }
}

/* What the school bought, if a school bought anything.
 *
 * licence_plans.ai_credits_per_day is what a seat is sold WITH — the premium
 * plan says fifteen a day and the price reflects it — and until this existed
 * it was a number displayed in the admin console and read by nothing. A school
 * on the premium plan got the free-plan allowance, which is a promise the
 * product takes money for and then does not keep.
 *
 * Returns null for a student with no live seat, which is the direct signup:
 * their allowance comes from their own subscription, as before.
 *
 * Read through the caller's own client, so the policies decide — licence_seats
 * is readable by the student it belongs to, and licence_plans by anyone signed
 * in. A student cannot see another child's seat and so cannot inherit their
 * allowance. */
export async function seatCreditsFor(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  try {
    const { data } = await supabase
      .from("licence_seats")
      .select("licences!inner(status, starts_on, expires_on, licence_plans!inner(ai_credits_per_day))")
      .eq("student_id", userId)
      .is("revoked_at", null)
      .limit(5);

    const today = new Date().toISOString().slice(0, 10);

    const live = (data ?? [])
      .map((row) => row.licences as unknown as {
        status: string;
        starts_on: string;
        expires_on: string;
        licence_plans: { ai_credits_per_day: number };
      })
      .filter(
        (licence) =>
          licence.status === "active" &&
          licence.starts_on <= today &&
          licence.expires_on >= today,
      );

    if (live.length === 0) return null;

    /* Two live seats is a school that bought a second licence mid-year and
       seated the child on both. The better allowance wins: they are paying for
       it twice and the child should not get the worse of the two. */
    return Math.max(...live.map((licence) => Number(licence.licence_plans.ai_credits_per_day ?? 0)));
  } catch {
    /* licensing.sql has not run. The subscription plan is the answer, which is
       what it was before any of this existed. */
    return null;
  }
}

export type ConsumeResult =
  | { ok: true; quota: Quota }
  | { ok: false; message: string; status: number };

/* Takes one slot. Call before generating, and `release` if generation then
   fails — a provider outage should not cost the student their allowance. */
export async function consume(
  supabase: SupabaseClient,
  userId: string,
  action: Action,
): Promise<ConsumeResult> {
  const plan = await planFor(supabase, userId);
  const subscriptionLimit = LIMITS[plan][action];

  /* A school seat, if there is one. The higher of the two wins rather than the
     seat simply overriding: a parent who also pays for pro while their child
     is on a school seat has paid twice, and taking the smaller number away
     from them is the version of this that generates a support ticket.

     Seat credits are a per-day AI allowance and the LIMITS table is per
     action; the seat number applies to the tutor and marking actions the plan
     is sold on, and never lowers what the subscription already gave. */
  const seatCredits = await seatCreditsFor(supabase, userId);

  const limit =
    seatCredits === null ? subscriptionLimit : Math.max(subscriptionLimit, seatCredits);

  const { data, error } = await supabase.rpc("consume_ai_quota", {
    p_action: action,
    p_limit: limit,
  });

  if (error) {
    return {
      ok: false,
      status: 500,
      message:
        "Usage limits are not set up on this database yet. Run supabase/schema.sql.",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row?.allowed) {
    return {
      ok: false,
      status: 429,
      message:
        plan === "free"
          ? `You've used all ${limit} ${ACTION_LABEL[action]} on the free plan today. It resets tomorrow, or upgrade for more.`
          : `You've hit today's limit of ${limit} ${ACTION_LABEL[action]}. It resets tomorrow.`,
    };
  }

  return { ok: true, quota: { used: row.used as number, limit } };
}

export async function release(supabase: SupabaseClient, action: Action) {
  try {
    await supabase.rpc("release_ai_quota", { p_action: action });
  } catch {
    /* The slot stays spent. Not worth failing the request the student is
       already seeing an error for. */
  }
}
