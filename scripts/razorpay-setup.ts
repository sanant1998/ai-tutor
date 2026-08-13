/* Creates the two Razorpay plans, once.
 *
 *   node --import ./scripts/register-alias.mjs scripts/razorpay-setup.ts
 *
 * Plans are reusable objects, and the checkout route deliberately does not
 * create them: doing it per checkout works, and quietly fills the dashboard
 * with thousands of identical plans that make every later reconciliation and
 * every refund investigation harder.
 *
 * Run this once per environment, put the ids in .env.local, and never think
 * about it again. It is idempotent in the only sense that matters — it refuses
 * to create a plan whose id is already configured. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPlan, isConfigured, PLANS, planIdFor, rupees, type PlanKey } from "@/lib/billing/razorpay";

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

async function main() {
  if (!isConfigured()) {
    console.error("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local first.");
    process.exit(1);
  }

  const live = String(process.env.RAZORPAY_KEY_ID).startsWith("rzp_live");

  if (live && !process.argv.includes("--live")) {
    /* A live key here creates real plans that real parents get charged
       against. Requiring the flag is cheap; discovering the mistake on a bank
       statement is not. */
    console.error(
      "RAZORPAY_KEY_ID is a LIVE key. Re-run with --live if that is what you mean.",
    );
    process.exit(1);
  }

  const created: Record<string, string> = {};

  for (const key of Object.keys(PLANS) as PlanKey[]) {
    const existing = planIdFor(key);

    if (existing) {
      console.log(`  ${key}: already configured as ${existing} — skipping`);
      continue;
    }

    const plan = await createPlan(key);
    created[`RAZORPAY_PLAN_${key.toUpperCase()}`] = plan.id;

    console.log(`  ${key}: created ${plan.id} (${rupees(PLANS[key].amount)})`);
  }

  if (Object.keys(created).length === 0) {
    console.log("\nNothing to do — both plans are already configured.");
    return;
  }

  console.log("\nAdd these to .env.local:\n");
  for (const [name, value] of Object.entries(created)) {
    console.log(`${name}=${value}`);
  }

  console.log(
    "\nThen point a webhook at /api/webhooks/razorpay for these events:\n" +
      "  subscription.activated, subscription.charged, subscription.pending,\n" +
      "  subscription.halted, subscription.cancelled, refund.processed\n" +
      "and put its signing secret in RAZORPAY_WEBHOOK_SECRET.\n\n" +
      "The webhook is the only thing that grants access. Without it, a parent\n" +
      "pays and nothing happens.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
