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
  const limit = LIMITS[plan][action];

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
