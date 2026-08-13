# PaperPath

Marketing site and auth screens for PaperPath — an AI revision platform for
Edexcel, Cambridge and CBSE students.

Built with Next.js 15 (App Router), TypeScript, Tailwind CSS, Radix primitives
and Supabase auth. Warm paper look by default, with a nine-theme picker and a
set of reading and focus options that change the live page.

The product name lives in `lib/brand.ts` alone — nav, footer, auth, onboarding,
metadata and structured data all read from it, so renaming is a three-string
change.

---

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase values
npm run dev                  # http://localhost:3000
```

| Script          | What it does                        |
| --------------- | ----------------------------------- |
| `npm run dev`   | Dev server with fast refresh        |
| `npm run build` | Production build                    |
| `npm start`     | Serve the production build          |
| `npm run lint`  | Next's ESLint pass                  |

### Environment

| Variable                        | Required | Notes                              |
| ------------------------------- | -------- | ---------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes      | Supabase → Project settings → API  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes      | Same page                          |

The auth screens render and validate without these, and show a clear message
instead of failing inside the SDK — so an unconfigured preview deploy still
looks right.

---

## Stack

| Layer         | Choice                                                         |
| ------------- | -------------------------------------------------------------- |
| Framework     | Next.js 15, App Router, React 19                                |
| Language      | TypeScript                                                      |
| Styling       | Tailwind CSS 3 + CSS custom properties for theming              |
| Components    | shadcn/ui conventions on Radix primitives (`components/ui`)     |
| Icons         | lucide-react                                                    |
| Motion        | Framer Motion                                                   |
| Smooth scroll | Lenis                                                           |
| Auth + data   | Supabase (Postgres), `@supabase/ssr` for cookie-based sessions  |

The previous build used React Router; routing here is the Next App Router
instead. Everything else in the stack is carried over.

---

## Layout

```
app/
  layout.tsx          fonts, metadata, JSON-LD, no-flash theme script
  page.tsx            the landing page, section by section
  globals.css         design tokens, glass surfaces, marquees, a11y modes
  login/ signup/      auth screens
  onboarding/         five-step setup, then the roadmap build
  (dashboard)/        the app: dashboard, roadmap, exams, progress, questions,
                      mock-papers, notes, papers, faq, feedback, pricing,
                      settings — paths mirror the live app exactly
  auth/callback/      OAuth + email-confirmation code exchange
components/
  primitives.tsx      Mesh, GlassCard, IconTile, SectionHeading, Eyebrow
  motion.tsx          Aurora, Spotlight, BorderBeam, CountUp, DrawnPath, …
  Reveal.tsx          scroll reveals + the calm-mode hook every animation uses
  Header.tsx          nav, mobile sheet
  AppearanceMenu.tsx  theme picker + reading and focus switches
  sections/           one file per landing section
  auth/               auth shell and forms
  ui/                 button, input, label
lib/
  brand.ts            the product name, in one place
  content.ts          every word on the marketing page
  theme.ts            theme list + palette accessors
  a11y.ts             reading/focus state and the classes it applies
  onboarding.ts       boards, subjects, units, and the answers captured
  topics.ts           topic catalogue per subject and unit
  study.ts            roadmap, urgency, progress, exams
  schedule.ts         the dated plan: learn + spaced review, packed per day
  repository.ts       the data seam — Supabase when signed in, else local
  supabase/           browser and server clients
supabase/schema.sql   tables, RLS policies and the new-user trigger
reference/screens/    captures of the live app, for checking the rebuild
middleware.ts         refreshes the Supabase session cookie
reference/            the previous site, kept for comparison
```

### Theming

Nine themes, matching the ones the product ships: Notebook (default), Inkwell,
Midnight, Ocean, Forest, Rose Noir, Ember, Daylight, Warm Paper. Each one
publishes the same token set on `<html>`, so switching theme is a single class
change with no JS-computed colour and therefore no hydration mismatch. Tokens
are published twice: ready to use (`var(--acc)`) and as raw RGB channels
(`rgb(var(--acc-rgb) / 0.3)`) for alpha.

`lib/theme.ts` owns the list and the `applyTheme` / `readTheme` helpers, so the
header's appearance menu and the onboarding picker cannot drift apart.

Components read them through the accessors in `lib/theme.ts`:

```tsx
style={{ color: text(0.62), background: acc(0.14) }}
```

A blocking script in `<head>` applies the saved theme before first paint, so a
returning visitor never sees a flash of the default.

### Reading and focus options

Dyslexia-friendly type, wider spacing, calm mode, high contrast and three text
sizes, all persisted and all applied as classes on `<html>`.

Calm mode matters for the code: the CSS override in `globals.css` cannot reach
JS-driven animation, so every Framer animation calls `useStillness()` from
`components/Reveal.tsx` and opts out. If you add an animation, use that hook —
it covers both calm mode and `prefers-reduced-motion`.

### Content

All copy lives in `lib/content.ts`. The `noscript` SEO mirror in
`components/sections/SeoMirror.tsx` is generated from the same module, so the
crawlable copy cannot drift from the visible page.

---

## Before launch

Three things need a human pass:

1. **Three FAQ answers** are marked `needsReview: true` in `lib/content.ts`
   (teachers and schools, tutor comparison, who it is best for). Those accordion
   items were collapsed in the captured copy of the old site, so their answers
   appear neither in the DOM nor in its FAQ structured data. They were written
   here in the same voice and are not sourced.
2. **Testimonials** name six students and are inherited from the previous site.
   Confirm they are real, current and cleared for use.
3. **Brand assets** are missing — see `public/README.md`. `favicon.png`,
   `logo-mark-icon.png` and `og-image.png` are referenced but not in the repo.
4. **Run `supabase/schema.sql`.** Until you do, `lib/repository.ts` silently
   falls back to `localStorage` — the app works, but nothing follows a student
   to another device. Once the tables exist, onboarding answers, progress, the
   study log and exam dates all sync. Practice answers, mock scores and
   feedback tickets are still local only.

5. **"Loved by 20,000+ students"** in the hero comes from the supplied design.
   The previous site said 80+ signed up, and the stats row still says 80+.
   These cannot both be true — pick one and make them agree.
6. **The Search Console token** in `app/layout.tsx` was issued for the old
   domain and will not verify a new one. The Organization `sameAs` was dropped
   for the same reason; add the new social handles when they exist.
7. **Google sign-in needs enabling in Supabase.** The code path is complete,
   but the provider is off in the project, so the button currently redirects
   to `{"error_code":"validation_failed","msg":"Unsupported provider: provider
   is not enabled"}`. See "Enabling Google sign-in" below.

## Enabling Google sign-in

This is dashboard configuration, not code.

1. **Google Cloud Console** → APIs & Services → Credentials → Create OAuth
   client ID → Web application.
   - Authorised redirect URI:
     `https://<your-project-ref>.supabase.co/auth/v1/callback`
2. Copy the client ID and client secret.
3. **Supabase dashboard** → Authentication → Providers → Google → enable, and
   paste both values.
4. **Supabase dashboard** → Authentication → URL Configuration:
   - Site URL: your site origin (`http://localhost:3000` while developing)
   - Redirect URLs: add `http://localhost:3000/auth/callback` and the
     production equivalent.

The app already sends users to `/auth/callback`, which exchanges the code for
a session and forwards to `/onboarding`.

## The app

`/onboarding` collects name, theme, board, subjects, units, deadline, rest
days, daily hours and grades, then simulates the roadmap build and hands off
to `/today`.

Everything the dashboard shows is derived from those answers by
`lib/study.ts` — the roadmap interleaves subjects, today's sessions are packed
into the daily hours budget, and the urgency score rises as the exam nears and
as topics stay uncovered. Same inputs, same output, every time.

`middleware.ts` guards every app route: signed-out visitors are sent to
`/login?next=…` and returned to where they were headed. Signed-in visitors are
bounced off `/login` and `/signup`. With Supabase unconfigured the guard is
inert, so a keyless preview deploy stays fully browsable.

These still need a model or an endpoint behind them, and each says so on
screen rather than showing invented content:

| Page                  | Needs                          |
| --------------------- | ------------------------------ |
| Notes                 | note generation                |
| Topic Wise Questions  | question generation + marking  |
| Mock Papers           | paper generation + marking     |
| Exam FAQs             | the mark-scheme answer bank    |
| Feedback              | a submission endpoint          |
| Past Papers           | links to your paper store      |

The Exam FAQs page deserves a note: it ships question prompts but no answers.
The page promises "mark-scheme phrasing, not approximations", and approximate
wording is exactly what loses marks — so the answers are left to the real
bank rather than generated.

The **topic catalogue** in `lib/topics.ts` is the other thing to check: the
Mathematics lists follow Edexcel IAL, but every other subject was written to
be plausible and needs verifying against the current specification. Topic
names, order and counts all drive what a student is told to revise.

Every other factual claim on the page — boards, plan limits, prices, marking
speed — is carried over unchanged from the previous site.

---

## The tutor

The revision side of the app generates everything: the model writes the
questions, marks them and writes the notes. That works for a student who
already knows the material and wants volume.

Teaching is a different job, and the tutor is built on the opposite principle.
The lesson is **written once, by hand, and stored** — concepts, hooks,
analogies, misconceptions, worked examples, and a question bank where every
wrong option is mapped to the wrong belief that produces it. The model's job
shrinks to delivering material it did not choose, which is the part it is
reliably good at.

### Setting it up

```bash
# 1  Run the migrations, in this order, in the Supabase SQL editor
#      supabase/schema.sql       the existing app
#      supabase/tutor.sql        curriculum, sessions, mastery, cost log
#      supabase/compliance.sql   consent, retention, safety flags

# 2  Add the service-role key to .env.local — see .env.example for why
SUPABASE_SERVICE_ROLE_KEY=...

# 3  Seed the curriculum
npm run content:validate     # checks every pack; also runs inside the seed
npm run content:seed         # idempotent — re-run after any edit

npm run test                 # sanitizer, verdict parsing, arithmetic, leaks
npm run evals                # golden set against a live model
```

### The teaching loop

```
START → HOOK → TEACH → CHECK ──got it──→ next concept, or SUMMARY → DONE
                 ▲        │
                 │     missed it
                 │        ▼
                 └──── RETEACH  (a different strategy each time)
                          │
                  after two reteaches
                          ▼
                    DOWNSHIFT — full worked example, then move on
```

Two rules make this work, and both live in `lib/pedagogy/beats.ts`:

**The model never decides what happens next.** It reports what it saw — did the
student follow, what kind of mistake was it — and the server computes the
transition from that plus counters the model cannot see. Left to itself a model
moves on when the student says "haan" without understanding, and re-explains
eleven times because the student keeps asking.

**The loop always terminates.** Three independent ceilings — twelve turns, two
reteaches, twenty-five minutes — and any one of them ends the concept. Keeping
a stuck student stuck is the worst thing this product can do: a thirteen-year-
old on their third failed attempt has stopped learning and started deciding
they are bad at maths. The right move is the full worked solution, a note that
the topic needs another day, and the spaced-repetition schedule bringing it
back when it can land.

Reteach changes *strategy*, not wording: a different analogy, then something
concrete and visual, then the full solution. A student who did not follow an
explanation will not follow it the second time either.

### Where the value is

| | |
| --- | --- |
| `content/` | **The product.** Everything else is an engine. |
| `lib/content/validate.ts` | Refuses a pack whose distractors map to nothing |
| `lib/pedagogy/evaluate.ts` | Two tiers — rules first, a model only for prose |
| `lib/math/verify.ts` | Exact fractions; no tolerance because none is needed |
| `lib/ai/sanitize.ts` | The tail buffer that stops `</s>` reaching a student |
| `lib/safety/gate.ts` | Runs before the model sees a word |
| `evals/` | The reason a prompt change is not a bet |

**The distractor map is the idea worth keeping.** Ask a model why a student
picked B and it produces a fluent, plausible, unverifiable answer that costs a
call and differs next Tuesday. The map is the same diagnosis, decided once, by
whoever wrote the question, at the moment they were thinking hardest about why
that option is tempting — free, instant, and correctable for ever.

The consequence is that `error_events.source` is the column to watch in
production. If `llm` is more than a small minority of rows, the content is too
thin, and the fix is more content rather than a better model.

### Streaming

`app/api/tutor/session/[id]/turn/route.ts` streams over SSE. Teaching beats
stream and self-correct if the arithmetic audit catches something; a **CHECK is
buffered** until the leak detector has read it, because a student who has seen
the answer has seen it and a correction afterwards fixes the transcript rather
than the lesson.

`X-Accel-Buffering: no` in `lib/sse.ts` is not decoration — without it nginx
holds the response until it has 4 KB, and streaming works perfectly in
development and not at all in production.

### Consent

Almost every user is a child. `supabase/compliance.sql` records date of birth,
locks a minor's account in `pending_consent`, and stores one row per purpose
against the policy version the parent actually read. `/api/tutor/session`
checks it before any text reaches a model, and fails closed if the migration
has not been run.

There is deliberately no `marketing` purpose for a minor: under the DPDP Act
behavioural advertising to children is prohibited, so the safe design is the
absence of the checkbox rather than an unticked one.

---

## Consent, before anything else

Almost every user is a child, and India's DPDP Act treats a child's data as its
own category: verifiable parental consent before processing, no behavioural
advertising to children at all, and a real route for a parent to see and delete
what is held.

Consent is also the one thing that cannot be retrofitted. It has to be recorded
when it is given, against the policy version the parent actually read, with
evidence of how it was verified — none of which can be reconstructed later from
a signup date.

**The flow.** A minor's account is created in `pending_consent` and can do
nothing. `/parent-consent` asks for a date of birth and a parent's number; a
one-time code and a single-use link go to that number. The parent either opens
the link on their own phone and ticks the purposes themselves, or reads the code
out when they are sitting with the child — the second path grants only the two
required purposes, because a code read across a room is not evidence anyone read
the optional ones.

**Four purposes, granular** (`lib/consent/purposes.ts`): account, AI processing,
voice, analytics. Two required, two genuinely optional and off by default. There
is no marketing purpose and there never will be — advertising to children is
prohibited, so the safe design is the absence of the checkbox rather than an
unticked one.

**Withdrawal is not deletion.** Pulling consent puts the account into
`read_only`: the student keeps everything they have done and nothing new is
processed. Destroying months of a child's work over a checkbox would make
parents afraid to touch the control. Deletion is separate and explicit, at
`/api/parent/data/[studentId]` — export returns every row as a JSON file, delete
schedules a hard erasure in 30 days and stops processing immediately.

---

## Money

`₹399` a month or `₹3,990` a year, against the ₹12,000 the incumbents charge —
which is the comparison a parent actually makes.

**UPI Autopay, not cards.** Card penetration among these parents is low and
recurring card charges fail more often than a mandate does. The checkout puts
UPI first.

**The webhook is the truth.** Razorpay's browser callback fires before
settlement, does not fire at all if the tab closes on a success, and is a fetch
a fourteen-year-old can make by hand. Nothing grants access except
`/api/webhooks/razorpay`, which verifies the signature over the raw body and
deduplicates on the delivery id — without that, one retry of
`subscription.charged` is a free month.

**A failed charge does not lock anyone out.** Mandate execution fails 15-20% of
the time in a given month and almost none of it is a parent who wants to cancel.
`past_due` with three days of grace, a WhatsApp message, then `halted`. Cutting
access on the first failure produces the churn it is meant to prevent.

**Free is the first chapter, whole** — every concept, every question, the fix
sheet. Not a trial: a parent cannot judge teaching from a countdown, and a trial
that expires mid-chapter converts on urgency rather than on the product being
good.

---

## Running it

```bash
# Migrations, IN THIS ORDER. It matters: compliance.sql replaces the trigger
# from schema.sql, and billing.sql references a table schools.sql creates.
# Out of order, nothing errors — it just quietly half-works.
#
#   schema.sql       the existing app
#   tutor.sql        curriculum, sessions, mastery, cost log
#   compliance.sql   consent, OTP, retention, safety flags, content drafts
#   schools.sql      orgs, sections, teacher functions
#   billing.sql      subscriptions, invoices, can_access_chapter
#   ratelimit.sql    per-IP limits
#   analytics.sql    the built-in event store and health_snapshot()
#   cron.sql         pg_cron schedules — edit the URL and secret first

npm run db:check                        # asks the database what it actually has
npm run db:verify-rls                   # asks it, as two real students, for things they must not have
npm run content:seed                    # curriculum into Postgres
node --import ./scripts/register-alias.mjs scripts/razorpay-setup.ts

npm run test                            # 42 unit tests, no network
npm run build && npm start &            # then, in another shell:
npm run smoke                           # 28 route tests, keyless
npm run check:bundle                    # gzipped first-load budget
npm run content:validate -- --strict
npm run evals                           # golden set against a live model
```

`npm run db:check` is the one to run first when something inexplicable is
happening on a deployment. It names the migration to run rather than leaving
you with "relation does not exist".

CI (`.github/workflows/ci.yml`) runs typecheck, tests, strict content
validation and a **keyless build** on every push — the keyless build proves
that an unconfigured deploy degrades to clear messages instead of exceptions.
The golden set runs with a subset on pull requests and in full on `main`, and
fails the build below 92% objective pass or a judged mean under 4.0.

| Script | |
| --- | --- |
| `scripts/validate-content.ts` | Refuses a pack whose distractors map to nothing |
| `scripts/seed-content.ts` | Idempotent upsert; validates first and refuses on an error |
| `scripts/author-concept.ts` | Model drafts a concept, arithmetic checked exactly, files it for review |
| `scripts/razorpay-setup.ts` | Creates the two plans once |
| `evals/run.ts` | Golden set, objective checks plus an LLM judge on a second provider |
| `scripts/verify-rls.ts` | Signs in as two students and asserts every privacy claim the product makes |
| `scripts/check-db.ts` | Names the migration to run, in order |
| `scripts/replay-webhook.ts` | Correctly-signed Razorpay payloads, including the mandate-failure path |
| `scripts/purge-storage.ts` | Deletes voice objects the SQL purge cannot reach |
| `scripts/smoke.ts` | 28 route tests against a running server, with **no credentials** — the question is whether an unconfigured deploy degrades cleanly, which a suite needing a database could never ask |
| `scripts/check-bundle.ts` | Gzipped first-load JS per route against a budget, with an exception list that has to be edited in the same commit that spends it |

### Cron

`supabase/cron.sql` schedules three jobs. Times are UTC and India is UTC+5:30 —
the offset is applied and each entry states its IST time.

| | | |
| --- | --- | --- |
| `paperpath-purge` | 08:00 IST daily | Retention. Transcripts at 24 months, voice at 30 days, flags at 12 |
| `paperpath-grace` | hourly | Expired payment grace → `halted` |
| `paperpath-reports` | 19:00 IST Sunday | Weekly parent digest on WhatsApp |

Sunday evening is when Indian families plan the week, which is the only moment
"next week's focus" does anything.

### Consoles

`/admin` links four internal screens, all behind an `ADMIN_EMAILS` allowlist —
an env list rather than a database flag, because a role column is one bad
UPDATE away from letting something change what every student is taught.

| | |
| --- | --- |
| `/admin/health` | The four numbers, each printed next to the threshold that should alert on it |
| `/admin/safety` | The flag queue. Urgent count first; every flag needs Actioned or False positive, and there is deliberately no third option |
| `/admin/content` | Draft → review → publish. No path from a model to the curriculum that skips a human |
| `/admin/schools` | Orgs, sections, teachers, roster import |

### Ops

The four numbers with alerts behind them, all in `lib/analytics/events.ts` and
computed by `health_snapshot()`:

- **cost per active student** — `llm_calls.cost_inr`. Alert at 50% over
  baseline; a buggy retry loop can eat a month's budget overnight.
  Visible at `/admin/health`, which is not an alert — someone still has to open
  it, and pretending a dashboard is monitoring is how a spike runs a fortnight.
- **verdict parse failure rate** — a weak model silently stops emitting the
  verdict block and every transition falls back to "did not understand".
- **`error_events.source = 'llm'` share** — if it is more than a small
  minority, the distractor maps are too thin. The fix is content, not a better
  model.
- **p95 first-token latency** — the only symptom of a provider problem a
  student can see.

Postgres: PITR on, daily snapshot, and **restore one once a month**. A backup
that has never been restored is not a backup.

---

## The screens

| | |
| --- | --- |
| `/tutor` → `/tutor/[topicId]` | The teaching loop. Beat visible, optimistic echo, voice button |
| `/practice/[topicId]` | One question at a time. A wrong option comes back with the **belief that produces it** — not a red cross |
| `/fix-sheet/tutor` | Printable. Built by query from `error_events`, no model call |
| `/privacy` | Consent state, per-purpose withdrawal, export, deletion. One tap from the nav |
| `/parent` | Five numbers and one instruction. Thirty seconds a week |
| `/parent-consent` → `/consent/[id]` | The student asks, the parent grants on their own phone |
| `/teacher/[sectionId]` | Heatmap first, class list second |
| `/admin/content` | JSON left, rendered student view right, publish blocked on validation errors |
| `/admin/schools` | Orgs, sections, teachers, roster import |

Two things on these screens are load-bearing rather than cosmetic. The **fix
sheet prints** — Indian parents put things on walls, and a diagnosis on a wall
is seen every morning rather than once on a phone. And the **parent link is
confirmed by the student**, with a real "no": a confirmation that cannot be
failed is the same as not having one.

---

## Still to build

Written down rather than implied, so nothing here reads as done:

Everything below needs something this repository cannot contain: an account
somewhere, a person, or a year of writing.

| | |
| --- | --- |
| **Nothing has run against a live database** | Eight SQL files, none executed. `npm run db:check` verifies presence and `npm run db:verify-rls` verifies behaviour — both exist and neither has run. Do this first; it is the largest untested surface in the project |
| **Someone to own the flag queue** | `/admin/safety` is now the tool. It has no owner. `lib/safety/escalate.ts` messages a parent on self-harm and the student sees helplines, but no trained human reads the queue. Before this goes past a pilot, that is a person |
| Legal review | `docs/legal-review.md` is the brief — the five open questions, the data inventory as implemented, and what to read in what order. Roughly an hour of counsel's time |
| WhatsApp templates | The four in `docs/whatsapp-templates.md` must be **approved** in the Meta console. The API returns 200 for an unapproved template and nothing arrives |
| One real Razorpay payment | `npm run billing:replay` exercises every webhook path locally, correctly signed, including the retry that must deduplicate. It cannot prove Razorpay's payloads look like ours — do one test-mode payment, then rely on the harness |
| Brand assets | `/icon-512.png` is generated from JSX and is a placeholder letter. Replace it with a designed mark |
| **Content beyond Ch 1** | Five topics of CBSE Class 8 Maths. `docs/authoring.md` is the guide; the format, validator, drafting script and review console are all finished. This is roughly 90% of the remaining work by effort and it is a hire, not a sprint |
| Native app | Wrap with Capacitor in phase 3. Do not rewrite |

### The self-harm policy, since it is a decision and not a default

Send, but narrowly. Not sending is unrecoverable; the ways sending goes wrong
are mitigable. So: **self-harm only** (not the other moderation categories),
**to the consent-verified number only** (the phone that completed the OTP —
not a number typed into a profile field), **never quoting the child**, and
**once in twenty-four hours**. The reasoning is written out in full at the top
of `lib/safety/escalate.ts`; change the conditions there and nowhere else.

---

## Notes

- `reference/` holds the previous site's saved HTML and CSS. It is excluded from
  TypeScript and Tailwind's content scan; keep it or delete it, nothing imports
  from it.
- The dev server caches Tailwind's config. After editing `tailwind.config.ts`,
  restart it — a running server will keep serving the old utilities.
- Running `next build` while `next dev` is up will break the dev server's
  chunks. Stop one before running the other.
