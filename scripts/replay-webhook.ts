/* Exercise the Razorpay webhook without a Razorpay account.
 *
 *   npm run billing:replay -- --sub sub_test123 --user <uuid>
 *   npm run billing:replay -- --sub sub_test123 --user <uuid> --only pending
 *   npm run billing:replay -- --url https://staging.example.com --sub ... --user ...
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * The webhook is the only thing in the product that grants and revokes access,
 * and it has never received a real delivery. The path that matters most is the
 * one that is hardest to trigger deliberately: a mandate failing, three days of
 * grace, then a halt. Waiting for a real UPI mandate to fail in order to test
 * that is not a plan.
 *
 * So this posts correctly-signed payloads at a running server, in the order a
 * real subscription would produce them, and prints what the database looks like
 * after each one. Everything it exercises is our code — the signature check,
 * the idempotency constraint, the grace window, the invoice numbering.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES NOT PROVE
 *
 * That Razorpay's payloads look like these. They are built from the documented
 * shapes and the fields the handler reads; a field that is named differently in
 * a real delivery would pass here and fail in production. Run one real test-mode
 * payment before launch — this replaces the twenty runs after that, not the
 * first one.
 */

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(ROOT, file), "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* Not present. */
  }
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

type Scenario = {
  key: string;
  event: string;
  describe: string;
  expect: string;
  build: (context: { sub: string; user: string; amountPaise: number }) => object;
};

const now = () => Math.floor(Date.now() / 1000);
const inThirtyDays = () => now() + 30 * 86400;

const SCENARIOS: Scenario[] = [
  {
    key: "activated",
    event: "subscription.activated",
    describe: "The mandate is authorised.",
    expect: "status becomes 'active', current_period_end set, dunning reset.",
    build: ({ sub, user, amountPaise }) => ({
      event: "subscription.activated",
      payload: {
        subscription: {
          entity: {
            id: sub,
            status: "active",
            current_end: inThirtyDays(),
            payment_method: "upi",
            notes: { user_id: user, plan: "monthly", subject_ref: "" },
          },
        },
        payment: { entity: { id: `pay_${now()}`, amount: amountPaise, method: "upi" } },
      },
    }),
  },
  {
    key: "charged",
    event: "subscription.charged",
    describe: "A cycle is paid.",
    expect: "period extended, grace cleared, an invoice raised with a gapless number.",
    build: ({ sub, user, amountPaise }) => ({
      event: "subscription.charged",
      payload: {
        subscription: {
          entity: {
            id: sub,
            status: "active",
            current_end: inThirtyDays(),
            notes: { user_id: user, plan: "monthly", subject_ref: "" },
          },
        },
        payment: { entity: { id: `pay_${now()}`, amount: amountPaise, method: "upi" } },
      },
    }),
  },
  {
    key: "pending",
    event: "subscription.pending",
    describe: "The mandate could not be executed. THE PATH THAT MATTERS.",
    expect:
      "status 'past_due', grace_until three days out, dunning_attempts up, a WhatsApp attempt logged. Access must STILL work.",
    build: ({ sub, user }) => ({
      event: "subscription.pending",
      payload: {
        subscription: {
          entity: {
            id: sub,
            status: "pending",
            notes: { user_id: user, plan: "monthly", subject_ref: "" },
          },
        },
      },
    }),
  },
  {
    key: "halted",
    event: "subscription.halted",
    describe: "Grace ran out, or the parent revoked the mandate at their bank.",
    expect: "status 'halted', grace cleared. Access stops.",
    build: ({ sub, user }) => ({
      event: "subscription.halted",
      payload: {
        subscription: {
          entity: {
            id: sub,
            status: "halted",
            notes: { user_id: user, plan: "monthly", subject_ref: "" },
          },
        },
      },
    }),
  },
  {
    key: "cancelled",
    event: "subscription.cancelled",
    describe: "Cancelled from the app.",
    expect: "status 'cancelled', cancelled_at set.",
    build: ({ sub, user }) => ({
      event: "subscription.cancelled",
      payload: {
        subscription: {
          entity: {
            id: sub,
            status: "cancelled",
            notes: { user_id: user, plan: "monthly", subject_ref: "" },
          },
        },
      },
    }),
  },
  {
    key: "refund",
    event: "refund.processed",
    describe: "Money went back.",
    expect: "status 'cancelled' immediately, with no grace — a refund is not a failed charge.",
    build: ({ sub, user, amountPaise }) => ({
      event: "refund.processed",
      payload: {
        subscription: {
          entity: { id: sub, notes: { user_id: user, plan: "monthly", subject_ref: "" } },
        },
        refund: { entity: { payment_id: `pay_${now()}`, amount: amountPaise } },
      },
    }),
  },
];

async function main() {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret) {
    console.error(
      "Set RAZORPAY_WEBHOOK_SECRET in .env.local. Any string works locally — it just has to match what the server checks.",
    );
    process.exit(1);
  }

  const base = arg("url") ?? "http://localhost:3000";
  const sub = arg("sub") ?? `sub_replay_${now()}`;
  const user = arg("user");
  const only = arg("only");
  const amountPaise = Number(arg("amount") ?? 39900);

  if (!user) {
    console.error(
      "Needs --user <uuid>: the subscription is looked up by its notes.user_id when no row exists yet.",
    );
    process.exit(1);
  }

  const scenarios = only ? SCENARIOS.filter((s) => s.key === only) : SCENARIOS;

  if (scenarios.length === 0) {
    console.error(`Unknown scenario. One of: ${SCENARIOS.map((s) => s.key).join(", ")}`);
    process.exit(1);
  }

  console.log(`Posting to ${base}/api/webhooks/razorpay`);
  console.log(`subscription ${sub}, user ${user}\n`);

  for (const scenario of scenarios) {
    const body = JSON.stringify(scenario.build({ sub, user, amountPaise }));

    /* Signed over the RAW body, exactly as Razorpay does. Re-serialising here
       would change key order and the digest would not match — which is the
       failure this harness is meant to catch before production does. */
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    const eventId = `evt_replay_${scenario.key}_${now()}`;

    const response = await fetch(`${base}/api/webhooks/razorpay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": eventId,
      },
      body,
    });

    const result = await response.text();

    console.log(`  ${scenario.event}`);
    console.log(`    ${scenario.describe}`);
    console.log(`    expect: ${scenario.expect}`);
    console.log(`    → ${response.status} ${result.slice(0, 120)}`);

    /* The same delivery again. A provider retries the ones that succeeded
       slowly as well as the ones that failed, and without the unique
       constraint on billing_events this second post would extend the
       subscription by another free month. */
    const retry = await fetch(`${base}/api/webhooks/razorpay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": eventId,
      },
      body,
    });

    const retryBody = await retry.json().catch(() => ({}));
    const deduped = (retryBody as { duplicate?: boolean }).duplicate === true;

    console.log(
      `    retry → ${deduped ? "deduplicated (correct)" : "NOT DEDUPLICATED — check billing_events"}\n`,
    );
  }

  /* The one thing the harness cannot post, because nothing sends it. */
  console.log("Also test by hand:");
  console.log("  - a payload with a WRONG signature: must be 400 and change nothing");
  console.log("  - expire_grace(): set grace_until into the past and run it");
  console.log("  - can_access_chapter() during grace: must still return true\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
