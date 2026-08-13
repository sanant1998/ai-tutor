/* May this student open this chapter?
 *
 * One function, called by every gate. The rule lives in Postgres
 * (can_access_chapter in supabase/billing.sql) rather than here, because the
 * teacher heatmap, the tutor route and the practice route all need the same
 * answer and three copies of a paywall rule become three different paywalls.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS FREE
 *
 * The first chapter of a subject, complete — every concept, every question, the
 * fix sheet, the lot. Not a seven-day trial and not three questions a day.
 *
 * A parent deciding whether teaching is worth ₹399 a month cannot judge it
 * from a countdown, and a trial that expires mid-chapter converts on urgency
 * rather than on the product being good. One whole chapter is the smallest
 * honest sample, and if the teaching is not good enough to sell the second
 * chapter then the pricing is not the problem. */

import "server-only";

import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export type AccessState = {
  allowed: boolean;
  reason: "free_chapter" | "subscribed" | "grace" | "school_seat" | "paywall" | "unconfigured";
  /* Set while a failed payment is inside its grace window, so the app can show
     a banner instead of silently continuing. */
  graceEndsOn?: string | null;
};

export async function chapterAccess(
  userId: string,
  chapterRef: string,
): Promise<AccessState> {
  /* Billing not installed. Open, not closed: a deployment without payments is
     a development or pilot deployment, and locking every chapter would make it
     useless. The consent gate fails closed because the cost of being wrong
     there is a child's data; the cost of being wrong here is a free lesson. */
  if (!isAdminConfigured()) return { allowed: true, reason: "unconfigured" };

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("can_access_chapter", {
    p_user: userId,
    p_chapter: chapterRef,
  });

  if (error) {
    /* The migration has not been run. Same reasoning as above. */
    return { allowed: true, reason: "unconfigured" };
  }

  if (data !== true) return { allowed: false, reason: "paywall" };

  /* Allowed — now say WHY, because the UI shows different things for a free
     chapter, a paid one and one being read during a grace period. */
  const { data: chapter } = await admin
    .from("chapters")
    .select("is_free")
    .eq("id", chapterRef)
    .maybeSingle();

  if (chapter?.is_free) return { allowed: true, reason: "free_chapter" };

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("status, grace_until")
    .eq("user_id", userId)
    .in("status", ["active", "past_due"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscription?.status === "past_due") {
    return {
      allowed: true,
      reason: "grace",
      graceEndsOn: subscription.grace_until as string | null,
    };
  }

  if (subscription?.status === "active") return { allowed: true, reason: "subscribed" };

  return { allowed: true, reason: "school_seat" };
}

/* The chapter a topic belongs to. Every gate is expressed per chapter because
   that is what is bought, but every screen works in topics. */
export async function chapterOfTopic(topicRef: string): Promise<string | null> {
  if (!isAdminConfigured()) return null;

  const { data } = await createAdminClient()
    .from("topics")
    .select("chapter_ref")
    .eq("id", topicRef)
    .maybeSingle();

  return (data?.chapter_ref as string | null) ?? null;
}

export const PAYWALL_MESSAGE =
  "The first chapter is free in full — this one is beyond it. Reading further needs a plan.";
