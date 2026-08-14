/* All landing copy.

   The messaging and section order are new. Every factual claim — boards,
   plan limits, prices, marking speed, sign-up count — is carried over
   unchanged from the previous site, so nothing here asserts something the
   product has not already claimed publicly.

   Two things need a human pass before launch and are flagged inline:
   the three FAQ answers marked `needsReview`, and the testimonials, which
   name real-sounding students and were inherited from the previous build. */

import { BRAND } from "@/lib/brand";
import { COACHING_YEARLY, PLANS as BILLING, rupees } from "@/lib/billing/prices";
import { limitLine } from "@/lib/plans";

export const NAV_LINKS = [
  { label: "Features", target: "features" },
  { label: "How it works", target: "how" },
  { label: "Boards", target: "boards" },
  { label: "Pricing", target: "pricing" },
  { label: "FAQ", target: "faq" },
] as const;

/* --------------------------------------------------------------------------
   Region

   Everything on this page that names a school system. The header toggle picks
   one of these two; useCountry() in components/CountryToggle.tsx is what reads
   it, and every section that says "CBSE" or "Grade 8" goes through here rather
   than hard-coding one country's version.

   The US half is deliberately thinner in its claims. Nothing is open for those
   standards yet — see lib/syllabus.ts, which has no US chapter lists — so this
   copy says what is listed and what is coming, never what is covered. A
   landing page that promises a Texan parent the same thing it promises a CBSE
   parent is a page that lies on the very next screen.

   Type-only import: erased at compile time, so this module still pulls no
   syllabus data into the client bundle. */
import type { CountryId } from "@/lib/syllabus";

export const REGION: Record<
  CountryId,
  {
    heroBadge: string;
    heroTrust: string;
    stats: { value: string; label: string }[];
    planTasks: { label: string; state: "done" | "active" | "todo" }[];
    trustItems: string[];
    firstStep: string;
    testimonialsSub: string;
    footerTagline: string;
    faqCoverage: string;
    pricingNote: string;
  }
> = {
  in: {
    /* "CBSE, ICSE and UP Board" and "3 boards covered" until the cards below
       started being derived from the real chapter lists — at which point the
       badge sat directly above an ICSE card reading "not open yet". ICSE has
       no sourced syllabus in lib/syllabus.ts and never has. Corrected to what
       is actually open rather than the other way round. */
    heroBadge: "Now covering CBSE and UP Board, Class 8 to 10",
    heroTrust: "Built on NCERT chapters",
    stats: [
      { value: "2", label: "boards open" },
      { value: "8–10", label: "classes open" },
    ],
    planTasks: [
      { label: "Science: Ch 5 — Life Processes", state: "done" },
      { label: "Maths: Ch 4 — Quadratic Equations", state: "done" },
      { label: "Science: Ch 11 — Electricity", state: "active" },
      { label: "Maths: Ch 6 — Triangles", state: "todo" },
    ],
    trustItems: [
      "CBSE",
      "ICSE",
      "UP Board",
      "Class 1–10",
      "NCERT chapters",
      "Maths",
      "Science",
      "Social Science",
      "English",
      "Hindi",
    ],
    firstStep:
      "Board, class, subject and the date you sit the paper. CBSE, ICSE or UP Board — mapped to this year's textbook chapters.",
    testimonialsSub: "Across three boards, including the parts that are still a work in progress.",
    footerTagline: "One calm revision hub for CBSE, ICSE and UP Board.",
    pricingNote: `The first chapter of every subject is free, in full — no card and no countdown. Paid plans are billed in rupees by UPI Autopay and can be cancelled any time. Coaching costs about ${COACHING_YEARLY} a year, for comparison.`,
    faqCoverage:
      "CBSE, ICSE and UP Board, for Class 1 to 10. Chapter lists are read off the real prescribed textbook — the NCERT books for CBSE and UP Board, CISCE's own syllabus for ICSE — and re-checked when a book is replaced, which several were for the 2026-27 session. Subjects open class by class rather than all at once; the signup screen shows exactly which are ready for your class today.",
  },
  us: {
    heroBadge: "Common Core, NGSS and state standards — opening soon",
    heroTrust: "Written to published standards",
    stats: [
      { value: "5", label: "standards listed" },
      { value: "K–12", label: "grades" },
    ],
    planTasks: [
      { label: "Science: Forces and Motion", state: "done" },
      { label: "Math: Quadratic Functions", state: "done" },
      { label: "Science: Energy Transfer", state: "active" },
      { label: "Math: Congruent Triangles", state: "todo" },
    ],
    trustItems: [
      "Common Core",
      "NGSS",
      "California",
      "Texas TEKS",
      "New York",
      "Florida B.E.S.T.",
      "Grades K–12",
      "Math",
      "Science",
      "Social Studies",
      "English Language Arts",
    ],
    firstStep:
      "State, grade, subject and your test date. Common Core and NGSS, or your own state's standards.",
    testimonialsSub:
      "From the students we have now — including the parts that are still a work in progress.",
    footerTagline: "One calm revision hub for Common Core, NGSS and state standards.",
    pricingNote:
      "We have not set US pricing yet, and there is nothing to buy until the standards open. Sign up and you will hear from us the day yours is ready — no card, and nothing to cancel.",
    faqCoverage:
      "Not yet — this is the honest answer. Common Core, NGSS, California, Texas TEKS, New York and Florida B.E.S.T. are the frameworks we are working through, and none of them are open today. Every list in this app is read off the published curriculum document before it goes in, and we would rather show a US student nothing than a plan built on chapters nobody set. Sign up and we will tell you the day yours is ready.",
  },
};

/* --------------------------------------------------------------------------
   Hero
   -------------------------------------------------------------------------- */
export const HERO = {
  /* badge, the first trust chip, the first two stats and the plan tasks all
     name a school system, so they live in REGION above. */
  headline: {
    lead: "Revision that knows what you",
    /* Set in marker pen with a hand-drawn underline. */
    accent: "need next.",
  },
  sub: `${BRAND.name} builds a topic-by-topic plan around your exam date, marks a full mock paper in about 30 seconds, and explains anything you are stuck on — at 1am, on a Sunday, whenever.`,
  primaryCta: "Start free — no card",
  secondaryCta: "See how it works",
  /* No student-count claim here. The old build carried two that contradicted
     each other — "20,000+" in the hero and "80+" in the stats row — and
     neither could be substantiated. A number goes back only when there is a
     real one to quote. */
  trust: [
    { icon: "check" as const, label: "Free to start" },
    { icon: "lock" as const, label: "Data stays private" },
  ],
  annotations: {
    focus: "Focus on what\nactually matters",
    steps: "Small steps\nbig results",
  },
  notebook: {
    title: "To do:",
    items: ["Organic chem revision", "Past paper", "Practise questions"],
  },
  /* Cycled one at a time under the buttons, so the page has a pulse. */
  liveTopics: [
    "Electrolysis",
    "Integration by parts",
    "Le Chatelier's principle",
    "Projectile motion",
    "Enzyme kinetics",
    "Redox equations",
  ],
  stats: [
    { value: "~30s", label: "to mark a full mock" },
    { value: "24/7", label: "help on call" },
  ],
  panel: {
    title: "Tonight's plan",
    action: "View full plan",
    progressLabel: "3 / 4 tasks completed",
    progress: 75,
  },
};

/* The trust-strip marquee is REGION[country].trustItems — it is a list of
   board and subject names, so there is no country-neutral version of it.

/* --------------------------------------------------------------------------
   Bento feature grid
   -------------------------------------------------------------------------- */
export type BentoIcon =
  | "route"
  | "clipboard"
  | "camera"
  | "repeat"
  | "notebook"
  | "timer"
  | "pen"
  | "accessibility";

export type BentoTile = {
  id: string;
  icon: BentoIcon;
  eyebrow: string;
  title: string;
  body: string;
  /* Tailwind column span for the lg grid. Every tile is one row tall: row
     spans leave a tall box with short content, which reads as a hole. */
  span: string;
  visual: "roadmap" | "marking" | "photo" | "heatmap" | "notes" | "focus" | "none";
  accent: "acc" | "acc2" | "acc3";
  /* The one tile that carries a larger title. */
  featured?: boolean;
};

export const BENTO_SECTION = {
  eyebrow: "The whole toolkit",
  heading: "One place for every part of revision",
  sub: "Planning, practising, marking and remembering — stitched together, so nothing falls through the gap between six different websites.",
};

export const BENTO_TILES: BentoTile[] = [
  {
    id: "roadmap",
    icon: "route",
    eyebrow: "Adaptive roadmap",
    title: "A plan that rewrites itself",
    body: "Give it your exam date and your board. It maps every topic on the specification, then reorders your week around whatever you got wrong last time. You open the app to a decision that has already been made.",
    span: "lg:col-span-2",
    visual: "roadmap",
    accent: "acc",
    featured: true,
  },
  {
    id: "marking",
    icon: "clipboard",
    eyebrow: "Mock marking",
    title: "Full paper, marked in ~30 seconds",
    body: "Examiner-style feedback against your board's mark scheme — which marks you earned, which you missed, and the exact wording that cost you.",
    span: "lg:col-span-2",
    visual: "marking",
    accent: "acc2",
  },
  {
    id: "tutor",
    icon: "camera",
    eyebrow: "Photo tutor",
    title: "Snap it, understand it",
    body: "Photograph any past-paper or textbook question and get the method step by step, in your board's command words.",
    span: "lg:col-span-1",
    visual: "photo",
    accent: "acc3",
  },
  {
    id: "spaced",
    icon: "repeat",
    eyebrow: "Spaced repetition",
    title: "Weak topics come back",
    body: "Your shakiest topics resurface on the day you were about to forget them. No deck to build, no cards to shuffle.",
    span: "lg:col-span-1",
    visual: "heatmap",
    accent: "acc",
  },
  {
    id: "notes",
    icon: "notebook",
    eyebrow: "Topic notes",
    title: "Notes written to the spec",
    body: "Every topic on your roadmap comes with notes generated for your exact specification — not a generic summary scraped off the internet.",
    span: "lg:col-span-2",
    visual: "notes",
    accent: "acc2",
  },
  {
    id: "focus",
    icon: "timer",
    eyebrow: "Focus",
    title: "Pomodoro and lo-fi, built in",
    body: "Timers, streaks and curated focus music, so the hour you sat down for is the hour you actually get.",
    span: "lg:col-span-1",
    visual: "focus",
    accent: "acc",
  },
  {
    id: "handwriting",
    icon: "pen",
    eyebrow: "Handwriting",
    title: "It marks your working",
    body: "Photograph your handwritten answer and the method gets marked, not just the final number. Built for maths and the sciences.",
    span: "lg:col-span-1",
    visual: "none",
    accent: "acc3",
  },
  {
    id: "access",
    icon: "accessibility",
    eyebrow: "Reading comfort",
    title: "Reads the way you read",
    body: "Dyslexia-friendly type, wider spacing, larger text, higher contrast, or a calm low-distraction mode — switched on whenever you want them. Try them from the palette button in the header.",
    span: "lg:col-span-2",
    visual: "none",
    accent: "acc2",
  },
];

/* --------------------------------------------------------------------------
   How it works
   -------------------------------------------------------------------------- */
export const HOW_SECTION = {
  eyebrow: "Getting started",
  heading: "Three steps, about a minute",
  sub: "No onboarding call, no card, no setting up a spreadsheet you will abandon by Thursday.",
};

/* Typed rather than `as const` so that step one may legitimately omit `body`.
   Its answer names the boards, so it comes from REGION at render time. */
export const HOW_STEPS: { n: string; title: string; body?: string }[] = [
  {
    n: "01",
    title: "Tell it your exam",
    /* Region-dependent: REGION[country].firstStep names the actual boards. */
  },
  {
    n: "02",
    title: "Get tonight's plan",
    body: "A topic-by-topic roadmap appears, front-loaded with whatever is weakest and closest to your exam.",
  },
  {
    n: "03",
    title: "Revise, submit, improve",
    body: "Work through it, submit questions and mocks, and watch the plan bend around your results.",
  },
];

/* --------------------------------------------------------------------------
   Comparison
   -------------------------------------------------------------------------- */
export const COMPARE_SECTION = {
  eyebrow: "Why it is different",
  heading: "Notes sites hand you a PDF. This hands you a plan.",
  sub: "The free stuff online is not wrong — it is just unowned. Nobody is deciding what you do tonight, and nobody is reading what you wrote.",
  before: {
    label: "Revision without a system",
    items: [
      "Forty tabs, six sites, one abandoned spreadsheet",
      "Twenty minutes deciding what to revise",
      "Re-reading the topics you already know",
      "Mocks that sit unmarked until your teacher has time",
      "Losing the same marks on command words every paper",
    ],
  },
  after: {
    label: "Revision with PaperPath",
    items: [
      "One place: plan, notes, papers, marking and tutor",
      "The next task is already chosen when you open it",
      "Weak topics resurface before you forget them",
      "A full mock marked in about 30 seconds, any hour",
      "The exact wording that cost you, flagged every time",
    ],
  },
};

/* --------------------------------------------------------------------------
   Boards
   -------------------------------------------------------------------------- */
/* The cards themselves are NOT listed here. They are derived from
   lib/syllabus.ts, which is the only place a board is allowed to exist, so
   this page cannot advertise one the product does not have. What lives here is
   the framing around them, which does differ by country: the US has no exam
   boards to map to, it has published standards. */
export const BOARDS = {
  eyebrow: "Find your syllabus",
  heading: "Mapped to your syllabus, not a generic one",
  byCountry: {
    in: {
      region: "India",
      sub: "Every chapter, question and mark scheme is tied to the board you actually sit — read off the real textbook, not a summary of it.",
      footnote:
        "More classes and subjects go in every term. Cannot see yours? Tell us and it goes on the list.",
    },
    us: {
      region: "United States",
      sub: "Every question and rubric is written to the standards your school follows — Common Core and NGSS, or your own state's.",
      /* Said plainly rather than implied. Nothing is loaded for these yet, and
         a card that looks identical to a working CBSE one would be a promise
         the product cannot keep on the next screen. */
      footnote:
        "We are still sourcing chapter lists for the US, so these are not open yet. Every list in this app is read off the published curriculum before it goes in — sign up and we will tell you the day yours is ready.",
    },
  },
  cta: "Start free",
};

/* --------------------------------------------------------------------------
   Accessibility
   -------------------------------------------------------------------------- */
export const ACCESSIBILITY = {
  eyebrow: "Reading and focus",
  heading: "Built to be read, not just looked at",
  body: "Not everyone reads or concentrates the same way, and a revision tool you cannot comfortably read for two hours is not much of a revision tool. These are honest comfort options rather than a fix for everything — and we are still adding more, so tell us what would help.",
  features: [
    {
      icon: "type" as const,
      title: "Dyslexia-friendly type",
      body: "Lexend, a typeface designed to make reading easier, across every note and question.",
    },
    {
      icon: "align" as const,
      title: "Readable spacing",
      body: "Wider letters and taller lines, so words stop running into each other on a long page.",
    },
    {
      icon: "brain" as const,
      title: "Calm mode",
      body: "No animation, no movement, no flashing. Lower sensory load when you need to concentrate.",
    },
    {
      icon: "contrast" as const,
      title: "Contrast and size",
      body: "Stronger contrast and larger text for low-strain reading, late at night or on a bad screen.",
    },
  ],
  hint: "Try them now — the palette button in the header changes this page live.",
};

/* --------------------------------------------------------------------------
   Testimonials
   Inherited verbatim from the previous site. Confirm these are real, current
   and cleared for use before launch.
   -------------------------------------------------------------------------- */
export type Testimonial = {
  initials: string;
  name: string;
  detail: string;
  rating: number;
  quote: string;
  tint: string;
};

export const TESTIMONIALS_SECTION = {
  eyebrow: "From the cohort",
  heading: "What students actually say",
  /* sub is REGION[country].testimonialsSub — it counts boards. */
};

/* Emptied deliberately.

   The previous build shipped six testimonials naming individual students with
   schools, cities and grade claims. They were inherited, not collected, and
   nobody could say whether those students exist or consented. Invented praise
   attributed to a named person is not a placeholder — it is a false statement
   about a real-sounding individual, so it is gone rather than reworded.

   Put real ones here once they are collected with permission. The section
   below hides itself while these are empty. */
export const TESTIMONIALS_ROW_1: Testimonial[] = [];
export const TESTIMONIALS_ROW_2: Testimonial[] = [];

/* --------------------------------------------------------------------------
   Pricing
   Figures carried over from the previous site's FAQ copy.
   -------------------------------------------------------------------------- */
export const PRICING_SECTION = {
  eyebrow: "Plans & pricing",
  heading: "Pick the plan that matches your run-up.",
  sub: `Notes sites give you notes and questions. ${BRAND.name} gives you a complete daily plan, AI marking, and a roadmap that thinks for you.`,
  /* The note is region-dependent — REGION[country].pricingNote. It described
     "a 3-day free trial" and a local-currency checkout, and billing implements
     neither: there is no trial in lib/billing/, and Razorpay charges rupees to
     everyone. What is actually free is the first chapter of a subject — see
     the top of lib/billing/access.ts, which argues for it over a trial. */
};

/* The launch banner is gone rather than corrected.
 *
 * It advertised "50% off your first month — code REVISE50", and nothing in
 * lib/billing/ has ever known that code: there is no coupon field on the
 * subscription, no offer_id, no discount branch. A student typing it into
 * Razorpay would be charged the full ₹399 and would be right to call that a
 * lie. Put it back the day the code exists in checkout. */

export type Plan = {
  id: string;
  name: string;
  icon: "sparkle" | "zap" | "crown";
  price: string;
  /* Shown struck through beside the price, when there is a discount. */
  wasPrice?: string;
  period: string;
  discountBadge?: string;
  altPrice?: string;
  altBadge?: string;
  tagline: string;
  features: string[];
  cta: string;
  featured?: boolean;
  comingSoon?: boolean;
};

/* Quoted from lib/billing/prices.ts — the same amounts Razorpay charges.
 *
 * These were hand-typed USD figures carried over from the previous site: "$0",
 * "$5.44 / first month" struck through from "$10.89", "or $81.42 / year", and
 * a third "Advanced" tier at "$35.40 / month". None of it was real. Checkout
 * has exactly two plans, both in rupees, and there is no Advanced product to
 * sell — so a visitor could read a dollar price, click through, and be handed
 * a ₹399 UPI mandate for a plan with a different name.
 *
 * The Advanced card is removed rather than repriced. It was marked
 * `comingSoon`, which is a promise with no date attached and nothing behind
 * it; bring it back when there is a plan definition for it. */
export const PLANS_BY_COUNTRY: Record<CountryId, Plan[]> = {
  in: [
  {
    id: "starter",
    name: "Starter",
    icon: "sparkle",
    price: "₹0",
    period: "forever",
    tagline: `Get a real taste of ${BRAND.name}.`,
    /* These lines are generated from the limits the server actually enforces,
       so the card cannot drift from the paywall. */
    features: [
      "The first chapter of every subject, in full",
      "Roadmap across every subject you pick",
      `${limitLine("free", "questions")} — 10 questions each`,
      `${limitLine("free", "mark")}, with mark scheme and model answer`,
      limitLine("free", "notes"),
      `${limitLine("free", "mocks")}, marked like the real thing`,
      "Pomodoro, streaks and focus music",
    ],
    cta: "Start free",
  },
  {
    id: "pro",
    name: "Pro",
    icon: "zap",
    price: rupees(BILLING.monthly.amount),
    period: "/ month",
    altPrice: `or ${rupees(BILLING.annual.amount)} / year`,
    altBadge: "Two months free",
    tagline: "The plan most students pick. Built for exam season.",
    features: [
      "Everything in Starter, plus every chapter",
      `${limitLine("pro", "questions")} — 400 questions a day`,
      limitLine("pro", "mark"),
      limitLine("pro", "notes"),
      `${limitLine("pro", "mocks")} with examiner-style feedback`,
      "Priority generation during exam season",
    ],
    cta: "Start with UPI",
    featured: true,
  },
  ],

  /* One card, and it quotes no price.
   *
   * lib/billing/prices.ts has no US plan set — Razorpay bills rupees, and
   * nothing here charges dollars. Showing ₹399 to a visitor in Ohio would be
   * a number their card will never be charged; converting it to "about $4.80"
   * would be a rate we do not use and a payment we cannot take. So the card
   * says what is true, and asks for an email instead of a card.
   *
   * It matches the Boards section, which already tells a US visitor that their
   * standards are not open. A page that says "not open yet" above and "$4.80 a
   * month" below is a page arguing with itself. */
  us: [
    {
      id: "us-waitlist",
      name: "Pro",
      icon: "zap",
      price: "—",
      period: "pricing set at launch",
      tagline: "Not open in the US yet.",
      features: [
        "Common Core, NGSS and state standards, once the chapter lists are sourced",
        "Everything the India build already does: roadmap, AI marking, tutor",
        "US pricing and billing are not set up yet, so there is nothing to charge",
        "Sign up and we will tell you the day your standards open",
      ],
      /* Not `comingSoon`: that renders a disabled button, and the whole
         point of this card is that the visitor CAN act — signing up is how
         they get told when their standards open. */
      cta: "Get notified",
      featured: true,
    },
  ],
};

/* --------------------------------------------------------------------------
   FAQ
   -------------------------------------------------------------------------- */
/* `a: null` means the answer depends on the country and comes from REGION.
   Exactly one entry uses it — the one that lists what is covered — and the Faq
   section substitutes REGION[country].faqCoverage for it. */
export type Faq = { q: string; a: string | null; needsReview?: boolean };

export const FAQ_SECTION = {
  eyebrow: "The specifics",
  heading: "Everything you need to know",
  sub: "The awkward questions included.",
};

export const FAQS: Faq[] = [
  {
    q: "What is PaperPath?",
    a: "PaperPath is an AI-powered revision platform that builds a personalised, topic-by-topic study roadmap for your exam and marks your practice automatically. It brings a study planner, AI-marked practice questions, mock-paper marking with examiner-style feedback, auto-generated topic notes and an AI tutor together in one place, so you always know what to revise next and where you are losing marks.",
  },
  {
    q: "Which exam boards and subjects does it cover?",
    /* The answer is REGION[country].faqCoverage. Until the toggle existed this
       one still described the removed international build — Edexcel,
       Cambridge, CBSE "grades 10-12", NEET and JEE — none of which the
       product has covered since the move to the Indian model. */
    a: null,
  },
  {
    q: "Is PaperPath free?",
    a: "Yes. The free Starter plan needs no card and includes a roadmap for one subject, 10 AI-marked topic-wise questions per day, 5 AI tutor messages to try it out, notes for 3 topics per week, and built-in focus music with Pomodoro timers and streaks.",
  },
  {
    q: "How much does Pro cost, and is there a discount?",
    /* Was: "AED 39.99 per month before VAT, or AED 299 per year... about
       £8.50, $10.89 or ₹920 a month... 50% off with code REVISE50... a 3-day
       free trial... An Advanced plan at AED 129.99 coming soon." Every figure
       and every offer in that sentence was untrue of the running product.
       Quoted from lib/billing/prices.ts now, so it cannot drift again. */
    a: `Pro is ${rupees(BILLING.monthly.amount)} a month, or ${rupees(BILLING.annual.amount)} a year — two months free. Billing is in rupees through UPI Autopay, which renews on its own and can be stopped any time. There is no free trial and no discount code, because there is something better: the first chapter of every subject is free in full — every concept, every question, the fix sheet — so you can judge the teaching before paying rather than racing a countdown. Coaching costs about ${COACHING_YEARLY} a year for comparison.`,
  },
  {
    q: "Why pay when free notes sites already exist?",
    a: "Free sites give you scattered notes and PDFs. They do not mark your mock paper, do not tell you which topic to revise on Tuesday, and do not catch the specific command-word mistakes losing you marks. You are paying for a planner, a marker and a tutor, not just another notes page.",
  },
  {
    q: "How does the AI marking work, and can I trust it?",
    a: "PaperPath marks both topic-wise questions and full mock papers using AI trained on official mark schemes and published examiner reports. Mock papers come back with examiner-style feedback rather than a simple right-or-wrong score, showing which marks you earned, which you missed and why, in the board's own wording. Treat it as a strict second opinion alongside your teacher, not a replacement for them.",
  },
  {
    q: "Can it mark handwritten answers?",
    a: "Yes. On Pro and above you can photograph your handwritten working and the AI will mark it. This is built for subjects like maths and the sciences, where the method and working — not just the final answer — earn the marks.",
  },
  {
    q: "What does the AI tutor do?",
    a: "The AI tutor answers subject questions and helps you work through problems as you revise. The free Starter plan includes 5 messages to try it out, Pro includes 200 messages per day, and Advanced removes the message cap entirely.",
  },
  {
    q: "Does it create study notes?",
    a: `Yes. Topic notes are generated automatically as part of your roadmap. Starter covers ${limitLine("free", "notes")}; Pro raises that to ${limitLine("pro", "notes")}.`,
  },
  {
    /* Was "What's the difference between the Pro and Advanced plans?" — there
       is no Advanced plan, so the question could only be answered by
       describing one. Replaced with the difference that does exist. */
    q: "What is the difference between Starter and Pro?",
    a: `Starter gives you the first chapter of every subject in full, plus ${limitLine("free", "questions")} and ${limitLine("free", "mocks")}. Pro opens every remaining chapter and raises the daily limits — ${limitLine("pro", "questions")}, ${limitLine("pro", "mocks")} and ${limitLine("pro", "tutor")}. Those are the numbers the server actually enforces, not marketing rounding.`,
  },
  {
    q: "Can I revise more than one subject at a time?",
    a: "Yes. Your roadmap covers every subject you pick and every exam date you enter, on either plan — what Pro changes is how much of each subject is open and how much you can do in a day.",
  },
  {
    q: "Does it have accessibility, reading and focus options?",
    a: "Yes. Once signed in you can switch on a dyslexia-friendly font, wider spacing, larger text, higher contrast, or a calm low-distraction mode, and the built-in focus music, Pomodoro timer and streaks help you stay on task. These are a core part of the product and we are actively adding more.",
  },
  {
    q: "What if I sign up and do not use it?",
    a: "Cancel any time — no contract, no awkward email. And you do not have to sign up to find out: the first chapter of every subject is free in full, so you can build a roadmap, sit a real chapter and mark a mock before any money is involved.",
  },
  /* The three answers below were not present in the captured page and were
     written to match the surrounding voice. Review before launch. */
  {
    q: "Can teachers and schools use PaperPath?",
    a: "Yes. Teachers can set a class up on the same roadmaps and marking their students use at home, and see where a cohort is consistently dropping marks rather than guessing from a spreadsheet. If you are a school or tuition centre, get in touch and we will set your group up directly.",
    needsReview: true,
  },
  {
    q: "What makes it different from a tutor or tuition class?",
    a: "A tutor gives you an hour or two a week at a fixed time. PaperPath sits with you every night: it decides what to revise, marks whatever you write, and explains the questions you get stuck on at 1am. It is built to work alongside a teacher or tutor, not to replace the person who knows you.",
    needsReview: true,
  },
  {
    q: "Who is PaperPath best for?",
    a: "Students in Class 8 to 10 who know they need to revise but lose the evening deciding how. If you are already scoring full marks with a system that works, you do not need us. If you are staring at forty tabs wondering where to start, that is exactly who this was built for.",
    needsReview: true,
  },
];

/* --------------------------------------------------------------------------
   Closing CTA and footer
   -------------------------------------------------------------------------- */
export const CTA = {
  heading: "Build tonight's plan in under a minute",
  sub: "No card, no call, no commitment. Map one subject, mark one real mock, and decide from there.",
  primary: "Start free",
  secondary: "See pricing",
};

export const FOOTER = {
  brand: "PaperPath",
  /* tagline is REGION[country].footerTagline — it names boards. */
  columns: [
    {
      title: "Product",
      links: [
        { label: "Features", target: "features" },
        { label: "How it works", target: "how" },
        { label: "Boards", target: "boards" },
        { label: "Pricing", target: "pricing" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "FAQ", target: "faq" },
        { label: "Students", target: "testimonials" },
      ],
    },
  ],
  legal: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "Refunds", href: "/refund" },
    { label: "Trust and security", href: "/trust" },
  ],
  copyright: "© 2026 PaperPath · Built by students, for students",
};
