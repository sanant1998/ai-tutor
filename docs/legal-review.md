# Brief for counsel

The privacy policy, terms and refund policy in `lib/legal.ts` were written
against the code rather than from a template: every retention period,
data category and third party named in them was read off the schema and the
routes. Nobody qualified has read them.

This document exists so a review takes an hour rather than a day. It states
what the product actually does, where each claim is enforced, and the five
questions that need a decision.

---

## What the product is

An AI tutor for Indian school students, Classes 6-10. Almost every user is
under 18. It is sold to parents at ₹399/month, and also to schools by the seat.

A student is taught one concept at a time by a language model working from
hand-written material, then practises on a hand-written question bank. Parents
receive a weekly summary. Teachers, where a school has bought seats, see class
aggregates.

---

## The five questions

### 1. Does the consent mechanism meet "verifiable parental consent"?

**What we do.** The student enters a parent's mobile number. A six-digit code
and a single-use link go to that number. The parent either opens the link on
their own phone and ticks each purpose, or reads the code out when sitting with
the child. Either route verifies possession of the phone number. The grant is
stored per purpose with the number, the policy version, the IP, the user agent
and the time, plus the exact wording shown.

**What we do not claim.** Nothing here proves the person holding the phone is
the child's parent. It proves possession of a number the child nominated. This
is the same standard Indian payments use for a UPI mandate.

**The question.** Is possession-of-nominated-number sufficient under the DPDP
Rules as notified? If not, what is the minimum additional step — a payment
instrument in the parent's name, a school-mediated route, something else?

Code: `lib/consent/otp.ts`, `app/api/consent/grant/route.ts`.

---

### 2. Is treating an unknown date of birth as "minor" the right default?

**What we do.** A new account is locked in `pending_consent` and can do nothing
until either a parent consents or the account holder states a date of birth of
18 or over. A missing DOB is treated as a minor.

An adult self-declares. We do not verify it. What a false declaration buys is
an ordinary account with identical processing — the safety gate, retention
limits and content restrictions were never conditioned on age, and there is no
advertising or profiling to unlock.

**The question.** Is a self-declared adult age acceptable given that it unlocks
nothing a consented child does not also have? Is there an obligation to do more
where we have reason to believe the declaration is false?

Code: `app/api/consent/adult/route.ts`, `app/(dashboard)/layout.tsx`.

---

### 3. Withholding transcripts from parents

**What we do.** The weekly parent report contains minutes studied, accuracy,
strong and weak topics, and one suggested focus. It does **not** contain the
conversation between the student and the tutor.

**Why.** A student who believes the conversation is read stops asking the
questions that reveal what they do not understand, and those questions are the
product. This is a pedagogical decision before it is a privacy one.

**What a parent can still get.** Everything, including transcripts, through the
data export at `/api/parent/data/[studentId]` — which we treat as the statutory
right of access and do not restrict.

**The question.** Is routing a parent's routine visibility away from the
transcript, while honouring the access right in full on request, defensible?
Does a parent of a minor have a continuing right to the content that this
design frustrates?

Code: `lib/parent/report.ts`, `app/api/parent/data/[studentId]/route.ts`.

---

### 4. The self-harm escalation

**What we do.** When a message trips the self-harm detector, the session pauses,
the student is shown Indian helplines (Tele-MANAS 14416, KIRAN, AASRA), a flag
is recorded for human review, and **one message is sent to the consent-verified
parent number** — self-harm only, never quoting the child, at most once in
twenty-four hours.

**What we do not have.** A trained safeguarding professional. The flag queue has
an interface (`/admin/safety`) and no owner.

**The question.** Two parts. First: is messaging a parent here correct, or is
there an obligation, a prohibition, or a required protocol we are not following?
Second: what is the minimum competent-person standard for reviewing the queue
before this can be offered beyond a pilot?

We consider this the highest-risk decision in the product.

Code: `lib/safety/escalate.ts`, `lib/safety/gate.ts`.

---

### 5. The refund promise

Full refund within seven days of any charge; after that, cancellation stops the
next renewal and the paid period runs out. The first chapter of a subject is
free in full, which is why the policy can be this simple.

**The question.** Does this satisfy Razorpay's onboarding requirements and
Indian consumer law? Is anything needed on annual plans specifically?

Code: `lib/legal.ts` (`REFUNDS`), `app/refunds/page.tsx`.

---

## Data inventory, as implemented

| What | Where | Retention | Enforced by |
| --- | --- | --- | --- |
| Name, email, DOB, class | `profiles` | Life of account | — |
| Consent grants and withdrawals | `consents` | Never deleted (evidence) | Rows are never updated in place |
| Conversations | `session_turns` | **24 months** | `purge_expired_data()` |
| Attempts, diagnosed errors, mastery | `attempts`, `error_events`, `topic_mastery` | Life of account | — |
| Voice recordings | `voice_blobs` + storage | **30 days** | `purge_expired_data()` + `scripts/purge-storage.ts` |
| Voice transcripts | `voice_blobs.transcript` | Treated as conversation | — |
| Safety flags with excerpt | `safety_flags` | **12 months after closure** | `purge_expired_data()` |
| Model call counts and cost | `llm_calls` | 13 months | `purge_expired_data()` |
| Analytics events (no free text) | `analytics_events` | Not yet bounded — **see below** | — |
| Subscriptions, invoices | `subscriptions`, `invoices` | Statutory | Retained on erasure, disclosed |

Erasure: `/api/parent/data/[studentId]` DELETE stops processing immediately and
hard-deletes after 30 days. Tax invoices are retained and the response says so.

**One gap to flag:** `analytics_events` has no retention rule yet. It contains
no free text (property names matching `message|content|answer|text|name|phone|
email|transcript|excerpt` are rejected at both the client and the collector),
but it is per-student behavioural data and should probably be bounded. Advise on
a period.

---

## Third parties

| Who | What they receive | Where |
| --- | --- | --- |
| AI model provider | Current concept, recent conversation. Never name, email or contact details | May be outside India |
| Supabase | All stored data | Per project region |
| Meta (WhatsApp Cloud API) | Parent's number, template parameters (name, counts) | Outside India |
| SMS gateway (fallback) | Parent's number, consent code | India |
| Razorpay | Payment details, which we never see or store | India |

---

## Things we deliberately do not do

Stated because their absence is a design decision, not an oversight:

- No marketing or advertising purpose exists in the consent model, and no
  checkbox for one. Behavioural advertising to children is prohibited, so the
  option is absent rather than unticked.
- Student conversations are not used to train models, ours or anyone else's.
- No cross-site tracking, no third-party analytics SDK, no third-party cookies.
  Analytics is a first-party JSON POST to our own collector.
- Teachers see class aggregates only. There is no endpoint that would give a
  teacher a transcript.

---

## What to read

Roughly an hour, in this order:

1. `lib/legal.ts` — the three documents themselves
2. `lib/consent/purposes.ts` — the four purposes and their wording
3. `lib/safety/escalate.ts` — the escalation policy, reasoning included
4. `supabase/compliance.sql` — retention, enforced
5. `lib/parent/report.ts` — what a parent gets and what they do not
