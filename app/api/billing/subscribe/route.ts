/* Starting a subscription.
 *
 * Returns what the browser needs to open Razorpay's checkout, and nothing that
 * decides access. The row written here is 'created' — a mandate that has been
 * asked for and not yet authorised — and only the webhook moves it on. */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import {
  createSubscription,
  isConfigured,
  PLANS,
  planIdFor,
  rupees,
  type PlanKey,
} from "@/lib/billing/razorpay";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isConfigured() || !isAdminConfigured()) {
    return fail("Payments are not configured on this deployment yet.", 503);
  }

  let body: { plan?: string; subjectRef?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const plan = (body.plan === "annual" ? "annual" : "monthly") as PlanKey;
  const planId = planIdFor(plan);

  if (!planId) {
    return fail(
      `No Razorpay plan id for "${plan}". Create one once with scripts/razorpay-setup.ts and set RAZORPAY_PLAN_${plan.toUpperCase()}.`,
      503,
    );
  }

  const admin = createAdminClient();

  /* Already paying. Charging a second mandate for the same thing is the kind
     of bug a parent only finds on a bank statement, and it costs the account
     whatever trust the product had. */
  const { data: existing } = await admin
    .from("subscriptions")
    .select("id, status, plan, current_period_end")
    .eq("user_id", user.value)
    .in("status", ["active", "past_due"])
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        error: "Is account pe pehle se ek subscription chalu hai.",
        subscription: {
          plan: existing.plan as string,
          status: existing.status as string,
          renewsOn: existing.current_period_end as string | null,
        },
      },
      { status: 409 },
    );
  }

  let created;
  try {
    created = await createSubscription({
      plan,
      planId,
      userId: user.value,
      subjectRef: body.subjectRef ?? null,
    });
  } catch (error) {
    /* The provider's own message reaches the log; the parent gets a sentence
       they can act on. A payments error that says "something went wrong" turns
       into a support ticket every time. */
    console.error("[billing] subscription create failed", error);
    return fail(
      "Payment shuru nahi ho paaya. Thodi der baad try karein, ya doosra tareeka chunein.",
      502,
    );
  }

  await admin.from("subscriptions").insert({
    user_id: user.value,
    subject_ref: body.subjectRef ?? null,
    provider: "razorpay",
    provider_sub_id: created.id,
    provider_plan_id: planId,
    plan,
    amount_inr: PLANS[plan].amount / 100,
    status: "created",
  });

  return NextResponse.json({
    subscriptionId: created.id,
    /* Public by design — it is the publishable key the checkout script needs.
       The secret never leaves the server. */
    keyId: process.env.RAZORPAY_KEY_ID,
    plan: {
      key: plan,
      label: PLANS[plan].label,
      amount: PLANS[plan].amount,
      display: rupees(PLANS[plan].amount),
    },
    /* Razorpay's hosted page, for the case where the inline checkout script
       fails to load — which on a weak connection it sometimes does. */
    fallbackUrl: created.short_url,
    /* The browser shows a spinner on this and polls; it never grants access
       itself, however encouraging the callback is. */
    confirmVia: "/api/billing/status",
  });
}
