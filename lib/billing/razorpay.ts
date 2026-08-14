/* Razorpay, and the two decisions that matter for India.
 *
 * ---------------------------------------------------------------------------
 * UPI AUTOPAY, NOT CARDS
 *
 * Card penetration among the parents buying this is low, and the cards that do
 * exist fail on recurring charges more often than a UPI mandate does — India's
 * card-on-file tokenisation rules broke a lot of recurring card flows and the
 * habit never came back. UPI Autopay is the rail that actually renews, so the
 * checkout offers it first and everything else second.
 *
 * ---------------------------------------------------------------------------
 * AMOUNTS ARE IN PAISE, ALWAYS
 *
 * Declared in lib/billing/prices.ts and re-exported below, so the pricing
 * pages quote the same numbers this file charges.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT DO
 *
 * Grant access. That is the webhook's job and only the webhook's job. A
 * function here that flips a subscription to active would be a function the
 * browser could reach. */

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/* Imported for use below, and re-exported so existing importers of this module
   keep working. The amounts themselves live in ./prices, which the pricing
   pages can also read — see the comment at the top of that file for why they
   could not read them here. */
import { PLANS, type PlanKey } from "@/lib/billing/prices";

export {
  PLANS,
  rupees,
  type PlanDefinition,
  type PlanKey,
} from "@/lib/billing/prices";

export function isConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

const API = "https://api.razorpay.com/v1";

function authHeader() {
  const token = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`,
  ).toString("base64");

  return `Basic ${token}`;
}

/* A thin fetch wrapper rather than the SDK's promise surface: the SDK's errors
   lose the provider's own message, and "Bad Request" with no body is not
   something anyone can debug against a payments API. */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();

  if (!response.ok) {
    let detail = text.slice(0, 300);
    try {
      detail = (JSON.parse(text) as { error?: { description?: string } }).error
        ?.description ?? detail;
    } catch {
      /* Keep the raw body. */
    }
    throw new Error(`Razorpay ${response.status}: ${detail}`);
  }

  return JSON.parse(text) as T;
}

/* --------------------------------------------------------------------------
   Plans

   Razorpay plans are created once and reused. Creating one per checkout works
   and quietly fills the dashboard with thousands of identical plans, which
   makes every later reconciliation harder. So the id is configured, and the
   helper below exists for the one-time setup rather than the hot path.
   -------------------------------------------------------------------------- */
export function planIdFor(plan: PlanKey): string | null {
  return (
    process.env[`RAZORPAY_PLAN_${plan.toUpperCase()}`] ??
    process.env.RAZORPAY_PLAN_ID ??
    null
  );
}

export async function createPlan(plan: PlanKey) {
  const definition = PLANS[plan];

  return call<{ id: string }>("/plans", {
    method: "POST",
    body: JSON.stringify({
      period: definition.period,
      interval: definition.interval,
      item: {
        name: `PaperPath ${definition.label}`,
        amount: definition.amount,
        currency: "INR",
      },
    }),
  });
}

/* --------------------------------------------------------------------------
   Subscriptions
   -------------------------------------------------------------------------- */
export type CreatedSubscription = {
  id: string;
  status: string;
  short_url: string;
};

export async function createSubscription(input: {
  plan: PlanKey;
  planId: string;
  userId: string;
  subjectRef?: string | null;
  notifyPhone?: string;
}): Promise<CreatedSubscription> {
  const definition = PLANS[input.plan];

  return call<CreatedSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      plan_id: input.planId,
      total_count: definition.totalCount,
      /* Razorpay sends its own payment reminders on the mandate. Left on —
         a parent who gets the bank's notification and ours is a parent whose
         mandate does not silently fail. */
      customer_notify: 1,
      /* Echoed back on every webhook for this subscription. This is how the
         handler knows whose it is without trusting anything from a browser. */
      notes: {
        user_id: input.userId,
        subject_ref: input.subjectRef ?? "",
        plan: input.plan,
      },
    }),
  });
}

export async function cancelSubscription(providerSubId: string, atCycleEnd = true) {
  return call<{ id: string; status: string }>(`/subscriptions/${providerSubId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ cancel_at_cycle_end: atCycleEnd ? 1 : 0 }),
  });
}

export async function fetchSubscription(providerSubId: string) {
  return call<{ id: string; status: string; current_end?: number }>(
    `/subscriptions/${providerSubId}`,
  );
}

/* --------------------------------------------------------------------------
   Webhook signature

   Razorpay signs the RAW body. Verifying against a re-serialised object fails
   intermittently and confusingly — key order and whitespace both change the
   digest — so the handler must pass the exact bytes it received.
   -------------------------------------------------------------------------- */
export function verifyWebhook(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");

  return a.length === b.length && timingSafeEqual(a, b);
}
