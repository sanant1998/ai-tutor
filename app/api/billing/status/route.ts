/* What the browser polls after checkout, and what the settings screen reads.
 *
 * The checkout callback fires before the webhook has necessarily landed, so
 * the client shows a spinner and polls this until `status` is active. That is
 * the whole reason the endpoint exists: access is decided by the webhook, and
 * the browser's job is to wait for it rather than to assert it. */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { PLANS, rupees, type PlanKey } from "@/lib/billing/razorpay";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) {
    return NextResponse.json({ configured: false, status: "none", plans: planList() });
  }

  const admin = createAdminClient();

  const [{ data: subscription }, { data: invoices }, { data: seat }] = await Promise.all([
    admin
      .from("subscriptions")
      .select("plan, status, method, current_period_end, grace_until, cancelled_at")
      .eq("user_id", user.value)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("invoices")
      .select("number, total_inr, gst_inr, issued_at")
      .eq("user_id", user.value)
      .order("issued_at", { ascending: false })
      .limit(12),
    admin
      .from("org_members")
      .select("role, orgs(name, expires_at)")
      .eq("user_id", user.value)
      .maybeSingle(),
  ]);

  const org = seat?.orgs as unknown as { name?: string; expires_at?: string } | null;

  const inGrace =
    subscription?.status === "past_due" &&
    subscription.grace_until &&
    new Date(subscription.grace_until as string).getTime() > Date.now();

  return NextResponse.json({
    configured: true,
    status: (subscription?.status as string) ?? "none",
    plan: (subscription?.plan as string) ?? null,
    method: (subscription?.method as string) ?? null,
    renewsOn: (subscription?.current_period_end as string) ?? null,

    /* Said plainly, because a parent whose payment failed needs to know they
       have days rather than discovering it when their child is locked out. */
    grace: inGrace
      ? {
          endsOn: subscription.grace_until as string,
          message:
            "The last payment did not go through. Study continues — please fix the payment method by this date.",
        }
      : null,

    /* A school seat overrides everything and should be visible, so a parent
       does not pay for something the school already bought. */
    schoolSeat: org?.name
      ? { org: org.name, expiresOn: org.expires_at ?? null }
      : null,

    invoices: (invoices ?? []).map((row) => ({
      number: row.number as string,
      total: `₹${Number(row.total_inr).toLocaleString("en-IN")}`,
      gst: `₹${Number(row.gst_inr).toLocaleString("en-IN")}`,
      issuedAt: row.issued_at as string,
    })),

    plans: planList(),
  });
}

function planList() {
  return (Object.keys(PLANS) as PlanKey[]).map((key) => ({
    key,
    label: PLANS[key].label,
    amount: PLANS[key].amount,
    display: rupees(PLANS[key].amount),
    note: PLANS[key].note,
  }));
}

/* Cancelling. Placed here rather than on its own route because a parent
   looking for it looks where the subscription is shown, and a cancellation
   that is hard to find is a chargeback waiting to happen. */
export async function DELETE() {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) return fail("Payments are not configured.", 503);

  const admin = createAdminClient();

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("id, provider_sub_id, current_period_end")
    .eq("user_id", user.value)
    .in("status", ["active", "past_due"])
    .maybeSingle();

  if (!subscription?.provider_sub_id) {
    return fail("No active subscription found.", 404);
  }

  const { cancelSubscription } = await import("@/lib/billing/razorpay");

  try {
    /* At cycle end, not immediately: they have paid for this month and taking
       it away on cancellation is theft with extra steps. The webhook writes
       the final state when the cycle closes. */
    await cancelSubscription(subscription.provider_sub_id as string, true);
  } catch (error) {
    console.error("[billing] cancel failed", error);
    return fail("That could not be cancelled. Please try again in a little while.", 502);
  }

  return NextResponse.json({
    cancelled: true,
    accessUntil: subscription.current_period_end as string | null,
    note: "Subscription cancelled. Study continues for the period already paid for.",
  });
}
