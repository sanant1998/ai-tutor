/* The Razorpay webhook. The only place a subscription changes state.
 *
 * ---------------------------------------------------------------------------
 * FOUR THINGS THIS HANDLER GETS RIGHT
 *
 * 1  RAW BODY. The signature is over the exact bytes Razorpay sent. Parsing
 *    first and re-serialising changes key order and whitespace, and the digest
 *    stops matching — intermittently, which is the worst way for it to fail.
 *
 * 2  IDEMPOTENCY. Providers retry, including the deliveries that succeeded
 *    slowly. Without the unique constraint on billing_events, one retry of
 *    subscription.charged extends a subscription by a free month.
 *
 * 3  ALWAYS 200 AFTER THE SIGNATURE PASSES. A 500 makes Razorpay retry, and
 *    if the failure is deterministic — a bug in our own handler — it retries
 *    for days. The event is stored first, its error recorded, and the retry is
 *    ours to run rather than the provider's to hammer.
 *
 * 4  GRACE, NOT REVOCATION. A failed charge does not lock a student out. See
 *    below.
 *
 * ---------------------------------------------------------------------------
 * WHY A FAILED PAYMENT KEEPS THE APP OPEN FOR THREE DAYS
 *
 * UPI mandate execution fails 15-20% of the time in a given month, and almost
 * none of that is a parent who wants to cancel: it is a balance that was short
 * on the 3rd, a bank outage, a notification nobody saw.
 *
 * Cutting access the moment a charge fails treats all of that as churn, and
 * produces it — the student loses their streak, the parent hears about it as a
 * complaint rather than a reminder, and the recovery conversation starts from
 * annoyance. Three days of grace with a WhatsApp message recovers most of them
 * and costs three days of one subscription in the cases it does not. */

import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { reportError } from "@/lib/observability";
import { verifyWebhook } from "@/lib/billing/razorpay";
import { sendTemplate, TEMPLATES } from "@/lib/messaging/send";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/* Long enough that a bank blip resolves, short enough that it is not a free
   month. Three days is where Indian subscription businesses land. */
const GRACE_DAYS = 3;

type Payload = {
  event: string;
  payload?: {
    subscription?: { entity?: RazorpaySubscription };
    payment?: { entity?: RazorpayPayment };
    refund?: { entity?: RazorpayRefund };
  };
};

type RazorpayRefund = {
  id?: string;
  payment_id?: string;
  /* Paise. Razorpay supports partial refunds, so this is not necessarily the
     whole payment. */
  amount?: number;
};

type RazorpaySubscription = {
  id: string;
  status?: string;
  current_end?: number;
  notes?: { user_id?: string; subject_ref?: string; plan?: string };
  payment_method?: string;
};

type RazorpayPayment = {
  id: string;
  amount?: number;
  method?: string;
  subscription_id?: string;
};

export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    /* 503 rather than 200: this one IS worth retrying, because the deployment
       is misconfigured rather than the event being bad. */
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  if (!verifyWebhook(raw, signature)) {
    /* No detail in the response. An unsigned caller learns nothing about why
       it was rejected. */
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let body: Payload;
  try {
    body = JSON.parse(raw) as Payload;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const admin = createAdminClient();

  /* Razorpay's delivery id, unique per delivery attempt of an event.
   *
   * The fallback matters more than it looks. It fires when the header is
   * missing, and it is the ONLY thing standing between a redelivery and a
   * second free month — so it has to be derived from the event's content, not
   * from a proxy for it. `raw.length` was a proxy: two different charges on
   * the same subscription serialise to the same number of bytes about as often
   * as not, and the second one would have been swallowed as a duplicate.
   *
   * A digest of the exact bytes signed is stable across redeliveries of the
   * same event and different for any other event. */
  const eventId =
    request.headers.get("x-razorpay-event-id") ??
    `${body.event}:${createHash("sha256").update(raw).digest("hex").slice(0, 32)}`;

  const { error: insertError } = await admin.from("billing_events").insert({
    provider: "razorpay",
    provider_event_id: eventId,
    event: body.event,
    payload: body as unknown as object,
  });

  /* Unique violation: seen this delivery before. Acknowledge and stop —
     re-processing is the bug this table exists to prevent. */
  if (insertError?.code === "23505") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    await handle(admin, body);

    await admin
      .from("billing_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider_event_id", eventId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    /* A webhook that fails silently is a subscription that silently does not
       grant access. This is the single most expensive place in the app for an
       error to go unnoticed. */
    await reportError("billing.webhook", error, { event: body.event, eventId });

    await admin
      .from("billing_events")
      .update({ error: message })
      .eq("provider_event_id", eventId);

    /* Still 200. The event is stored with its error and can be replayed from
       our side; a non-2xx here starts a retry storm against a bug that will
       fail identically every time. */
  }

  return NextResponse.json({ ok: true });
}

async function handle(admin: ReturnType<typeof createAdminClient>, body: Payload) {
  const subscription = body.payload?.subscription?.entity;
  const payment = body.payload?.payment?.entity;

  const providerSubId = subscription?.id ?? payment?.subscription_id;
  if (!providerSubId) return;

  const { data: row } = await admin
    .from("subscriptions")
    .select("id, user_id, plan, amount_inr, dunning_attempts")
    .eq("provider_sub_id", providerSubId)
    .maybeSingle();

  /* An event for a subscription we have no row for. Happens when a mandate is
     created in the Razorpay dashboard by hand, and when a test event arrives
     in production. The notes carry the user id, so it can be reconstructed
     rather than dropped.

     Upserted on provider_sub_id rather than inserted-then-reread: two events
     for the same new subscription can be in flight at once — Razorpay sends
     `authenticated` and `charged` within the same second — and a plain insert
     makes the second one either a duplicate row or a unique violation that
     lands in the error column while the subscription silently fails to
     activate. `ignoreDuplicates` keeps the first writer's row and lets the
     second carry on to the state machine below. */
  if (!row) {
    const userId = subscription?.notes?.user_id;
    if (!userId) return;

    const { error: upsertError } = await admin.from("subscriptions").upsert(
      {
        user_id: userId,
        subject_ref: subscription?.notes?.subject_ref || null,
        provider: "razorpay",
        provider_sub_id: providerSubId,
        plan: subscription?.notes?.plan ?? "monthly",
        amount_inr: (payment?.amount ?? 0) / 100,
        status: "created",
      },
      { onConflict: "provider_sub_id", ignoreDuplicates: true },
    );

    /* Thrown rather than swallowed: the outer handler records it against the
       stored event so it can be replayed. A subscription that fails to
       reconstruct and says nothing is a parent who paid and has no access. */
    if (upsertError) {
      throw new Error(
        `could not reconstruct subscription ${providerSubId}: ${upsertError.message}`,
      );
    }
  }

  const current =
    row ??
    (
      await admin
        .from("subscriptions")
        .select("id, user_id, plan, amount_inr, dunning_attempts")
        .eq("provider_sub_id", providerSubId)
        .maybeSingle()
    ).data;

  if (!current) return;

  const periodEnd = subscription?.current_end
    ? new Date(subscription.current_end * 1000).toISOString()
    : null;

  switch (body.event) {
    /* The mandate is authorised. Access starts. */
    case "subscription.activated":
    case "subscription.authenticated": {
      await admin
        .from("subscriptions")
        .update({
          status: "active",
          method: subscription?.payment_method ?? payment?.method ?? null,
          current_period_end: periodEnd,
          grace_until: null,
          dunning_attempts: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", current.id);
      break;
    }

    /* A cycle was paid. Extend, clear any dunning state, raise an invoice. */
    case "subscription.charged": {
      await admin
        .from("subscriptions")
        .update({
          status: "active",
          current_period_end: periodEnd,
          grace_until: null,
          dunning_attempts: 0,
          method: payment?.method ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", current.id);

      if (payment?.amount) {
        /* Through the function, so the invoice number comes from the gapless
           per-financial-year sequence rather than a count. */
        await admin.rpc("issue_invoice", {
          p_user: current.user_id,
          p_subscription: current.id,
          p_total_inr: payment.amount / 100,
          p_payment_id: payment.id,
        });
      }
      break;
    }

    /* The mandate could not be executed. Grace, then a message. */
    case "subscription.pending": {
      const graceUntil = new Date(Date.now() + GRACE_DAYS * 86400000).toISOString();
      const attempts = Number(current.dunning_attempts ?? 0) + 1;

      await admin
        .from("subscriptions")
        .update({
          status: "past_due",
          grace_until: graceUntil,
          dunning_attempts: attempts,
          updated_at: new Date().toISOString(),
        })
        .eq("id", current.id);

      await notifyParent(admin, current.user_id as string, {
        template: TEMPLATES.paymentFailed,
        params: [`₹${Number(current.amount_inr ?? 0).toLocaleString("en-IN")}`, String(GRACE_DAYS)],
      });
      break;
    }

    /* Grace exhausted, or the parent revoked the mandate at their bank. */
    case "subscription.halted": {
      await admin
        .from("subscriptions")
        .update({
          status: "halted",
          grace_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", current.id);
      break;
    }

    case "subscription.cancelled":
    case "subscription.completed": {
      await admin
        .from("subscriptions")
        .update({
          status: body.event === "subscription.cancelled" ? "cancelled" : "expired",
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", current.id);
      break;
    }

    /* Money went back, so access does too — immediately and without grace,
       because a refund is not a failed charge.
     *
     * But only for a FULL refund. Razorpay supports partial refunds, and they
     * are how an ordinary goodwill gesture is issued: a parent complains about
     * one bad week, support sends back ₹100 of ₹399, and under the old code
     * that ended the subscription they had just been apologised to for. The
     * refund entity carries its own amount; compare it against what was
     * charged before revoking anything. */
    case "refund.processed": {
      const refund = body.payload?.refund?.entity;
      const refunded = Number(refund?.amount ?? 0) / 100;
      const charged = Number(current.amount_inr ?? 0);

      /* Unknown amounts are treated as full. Being wrong that way ends a
         subscription that money was returned for; being wrong the other way
         keeps a refunded student on a paid product, which is the failure that
         cannot be explained to anyone. */
      const full = !refunded || !charged || refunded >= charged;

      if (!full) {
        console.info(
          `[razorpay] partial refund of ₹${refunded} against ₹${charged} on ${providerSubId} — access unchanged`,
        );
        break;
      }

      await admin
        .from("subscriptions")
        .update({
          status: "cancelled",
          grace_until: null,
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", current.id);
      break;
    }

    default:
      /* Razorpay sends a great many events. Storing them all and acting on
         seven is correct; the rest are for reconciliation. */
      break;
  }
}

/* Best effort. A subscription must not fail to update because a WhatsApp
   template is unapproved. */
async function notifyParent(
  admin: ReturnType<typeof createAdminClient>,
  studentId: string,
  message: { template: string; params: string[] },
) {
  try {
    const { data: link } = await admin
      .from("consents")
      .select("evidence")
      .eq("student_id", studentId)
      .eq("purpose", "account")
      .order("granted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const phone = (link?.evidence as { phone?: string } | null)?.phone;
    if (!phone) return;

    await sendTemplate({ to: phone, template: message.template, params: message.params });
  } catch (error) {
    console.error("[razorpay] parent notification failed", error);
  }
}
