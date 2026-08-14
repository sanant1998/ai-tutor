/* What we actually charge, in one place.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT IN razorpay.ts
 *
 * It was, and razorpay.ts is `server-only` — it imports the Node crypto module
 * and holds the webhook secret, so no pricing page can read from it. The
 * landing page and the in-app pricing page therefore carried their own hand-
 * typed copies, and both drifted: the site advertised "$5.44 / first month",
 * "$81.42 / year" and a "$35.40 Advanced" tier, plus a REVISE50 discount code
 * and a 3-day free trial, while checkout charged ₹399 for the only two plans
 * that exist and implemented neither the code nor the trial. A visitor could
 * click "Start 3-day trial" at $5.44 and be handed a ₹399 UPI mandate.
 *
 * So the amounts live here, in a module with no imports and no server-only
 * marker, and everything reads from it: razorpay.ts to charge, the pricing
 * pages to quote. A price change is one edit and cannot land in one place and
 * not the other.
 *
 * ---------------------------------------------------------------------------
 * AMOUNTS ARE IN PAISE, ALWAYS
 *
 * Razorpay takes integer paise. ₹399 is 39900. Passing 399 charges ₹3.99 and
 * the mistake is invisible until a bank statement arrives, so nothing here
 * handles a rupee float — the plans are declared in paise and the only
 * conversion is for display.
 *
 * ---------------------------------------------------------------------------
 * ONE CURRENCY
 *
 * There is no USD price because there is no USD plan. Razorpay bills in
 * rupees, the subscriptions above are rupee subscriptions, and a dollar figure
 * on the pricing page would be a conversion we do not perform and a number no
 * card statement will ever show. When US billing exists, it goes here. */

/* Type-only, so this module still has no runtime imports. */
import type { CountryId } from "@/lib/syllabus";

export type PlanKey = "monthly" | "annual";

export type PlanDefinition = {
  key: PlanKey;
  label: string;
  /* Paise. */
  amount: number;
  period: "monthly" | "yearly";
  interval: number;
  /* How many cycles the mandate is authorised for. */
  totalCount: number;
  note: string;
};

export const PLANS: Record<PlanKey, PlanDefinition> = {
  monthly: {
    key: "monthly",
    label: "Monthly",
    amount: 39900,
    period: "monthly",
    interval: 1,
    totalCount: 12,
    note: "Cancel any time",
  },
  annual: {
    key: "annual",
    label: "Annual",
    /* Two months free. Priced against the ₹12,000/year the incumbents charge,
       which is the comparison a parent actually makes. */
    amount: 399000,
    period: "yearly",
    interval: 1,
    totalCount: 3,
    note: "Two months free — ₹3,990 a year",
  },
};

export function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/* What the incumbent costs, for the only comparison a parent actually makes.
   Quoted on the paywall and the pricing page, so it lives beside the price it
   is being compared against. */
export const COACHING_YEARLY = "₹12,000";

/* Which countries can actually be billed.
 *
 * The slot is here, empty, rather than absent: the pricing pages ask this
 * module what a country costs and get `null` for the US, which is a different
 * and more useful answer than the rupee price they would otherwise show a
 * visitor in Ohio. Filling it in is one edit and nothing downstream changes
 * shape.
 *
 * The processor for US billing is deliberately undecided. Stripe would mean a
 * second checkout path chosen by country; Razorpay international would keep
 * one path but needs international payments enabled and USD subscription plans
 * created there. Neither is built, so neither is assumed. */
export const PLANS_BY_COUNTRY: Record<
  CountryId,
  Record<PlanKey, PlanDefinition> | null
> = {
  in: PLANS,
  us: null,
};
