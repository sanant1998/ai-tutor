/* Plan limits, in one place.

   The quota guard enforces these and the pricing page quotes them. They live
   here rather than in either, because a pricing page promising "unlimited"
   while the server enforces forty is the kind of drift a student discovers by
   paying and then hitting a wall.

   No "server-only" here on purpose: the pricing page is a client component and
   has to be able to read the same numbers. */

export type Plan = "free" | "pro";

export type Action =
  | "questions"
  | "mark"
  | "notes"
  | "mocks"
  | "faqs"
  | "explain"
  /* One teaching TURN, not one session. A session is roughly ten turns, so the
     free allowance below is about two full concepts a day — enough to judge
     the teaching, not enough to run a class on. Counting turns rather than
     sessions is what stops one student holding a single session open all
     evening. */
  | "tutor";

/* Per day. Free is sized so a student can genuinely revise one topic properly
   and sit one mock — enough to feel the product before paying. */
export const LIMITS: Record<Plan, Record<Action, number>> = {
  free: { questions: 3, mark: 40, notes: 5, mocks: 1, faqs: 10, explain: 3, tutor: 25 },
  pro: { questions: 40, mark: 500, notes: 60, mocks: 10, faqs: 200, explain: 40, tutor: 400 },
};

export const ACTION_LABEL: Record<Action, string> = {
  questions: "question sets",
  mark: "marked answers",
  notes: "note pages",
  mocks: "mock papers",
  faqs: "FAQ answers",
  explain: "narrated explainers",
  tutor: "tutor replies",
};

/* "3 question sets / day" — the phrasing both the paywall message and the
   pricing card use. Singularised, because the free tier has a limit of 1 and
   "1 mock papers" reads like a bug. */
export function limitLine(plan: Plan, action: Action) {
  const count = LIMITS[plan][action];
  const label = ACTION_LABEL[action];

  return `${count} ${count === 1 ? label.replace(/s$/, "") : label} / day`;
}
