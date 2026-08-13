# Writing a content pack

This is the job. Everything else in the repository is an engine for delivering
what you write here.

You do not need to be able to code. You need a text editor, and you need to run
one command to check your work.

---

## The shape of it

One JSON file per **topic**. A topic holds one or more **concepts**. A concept
is one idea a student can be taught in about ten minutes and then tested on.

```
content/cbse/class8/maths/ch01/t02-additive-inverse.json
        board  class  subject  chapter  topic
```

Copy the nearest existing file and edit it. That is faster than starting from
the schema, and it keeps the ids in the same shape.

---

## The five fields that matter, in order of how much they matter

### 1. `misconceptions` — this is the product

Four of them, and they must be errors **real students make**. Not errors a
student could theoretically make. Not the opposite of the right answer.

The test: have you watched a student do this, or marked it in a book? If you
are inventing something plausible, stop and think about what actually goes
wrong when you teach this topic.

Each one has four parts and they do different work:

```json
{
  "id": "m1",
  "wrong_belief": "Additive inverse matlab ulta kar do — 3/5 ka inverse 5/3.",
  "why_wrong": "Wo multiplicative inverse hai, jisse guna karne par 1 aata hai...",
  "correction": "Jodna hai to sign badlo. Guna hai to ulta karo.",
  "probe": "3/5 me kya jodun ki 0 aaye? Aur kis se guna karun ki 1 aaye?"
}
```

- **`wrong_belief`** — in the student's own voice. Write what they would say,
  not what a textbook would call it.
- **`why_wrong`** — an *explanation*, not a restatement. "Because that is not
  the definition" is not an explanation. Show them the contradiction.
- **`correction`** — the one line worth remembering. This is what gets printed
  on the fix sheet and stuck on a wall. Make it short enough to remember and
  specific enough to use.
- **`probe`** — a question that surfaces *this* error and no other. The tutor
  asks it when it suspects this misconception.

**Ids are permanent.** `m1` stays `m1` for ever. Questions point at these ids,
and so do the records of every mistake a student has ever made. Add `m5`; never
renumber.

### 2. `hook`

An everyday Indian situation. Money and udhaar, cricket, a lift, a bus, a shop,
marks. It ends with a curiosity question and it never states the definition.

Not a Western example. Not an abstract one. A student who cannot picture the
situation gets nothing from it.

### 3. `worked_examples`

Two of them, with numbered steps. Every step is a real step — never "ab solve
karo".

**Check the arithmetic.** The seed script checks it too, exactly, and will
refuse the file — but the point is that a wrong sum in a worked example is
worse than no example at all.

### 4. `statement`

The definition, in one or two sentences. Crisp. The tutor teaches from this, so
if it is woolly the lesson is woolly.

### 5. `questions`

Eight or more per concept, spread across four levels:

| | |
| --- | --- |
| **L1** Foundation | Direct application. The method is obvious from the question. |
| **L2** Core | The standard textbook exercise, two or three steps. |
| **L3** Applied | The student has to work out *which* method applies. |
| **L4** Advanced | Multi-step, or combines this with another topic. |

The jump that loses students is L2 → L3, not L3 → L4. Spend your effort there.

---

## `distractor_map` — the thing that makes this worth doing

Every wrong option maps to the misconception that produces it.

```json
{
  "options": [
    { "key": "A", "text": "$-\\frac{5}{8}$" },
    { "key": "B", "text": "$\\frac{8}{5}$" },
    { "key": "C", "text": "$-\\frac{8}{5}$" },
    { "key": "D", "text": "$\\frac{5}{8}$" }
  ],
  "correct": ["A"],
  "distractor_map": { "B": "m1", "C": "m1", "D": "m2" }
}
```

This is why the app can tell a student *"you picked that because you are
thinking of the reciprocal"* instead of *"wrong"*. It costs nothing at runtime
and it is right every time, because you decided it while you were thinking
hardest about why that option is tempting.

So: **write the wrong options on purpose.** A distractor that maps to nothing is
a wasted option — nobody picks it, and if they do we learn nothing. Every wrong
answer should be the answer a specific misunderstanding produces.

---

## Maths

Between `$...$`, in LaTeX. In JSON a backslash is written twice:

```json
"stem": "$\\frac{5}{8}$ ka additive inverse kya hai?"
```

`\\frac{5}{8}` in the file renders as ⁵⁄₈ on screen. Preview it in the content
console (`/admin/content`) rather than trusting the source — LaTeX looks fine as
a string and wrong when typeset.

---

## Language

Simple English with the Hindi words a student actually uses: *matlab, socho,
dekho, chalo, samajh aaya, bilkul*. Not formal Hindi. Not academic English.

Read it aloud. If it does not sound like a person explaining something to a
thirteen-year-old sitting next to them, rewrite it.

---

## Checking your work

```bash
npm run content:validate
```

It will tell you, per file:

- a question pointing at a misconception that does not exist
- a wrong option that maps to nothing
- a concept with no L1 question, or with fewer than six questions
- a misconception no question ever tests
- unbalanced `$` delimiters
- a worked example whose arithmetic does not add up

**Errors block the seed. Warnings are gaps worth filling.** Aim for zero of
both; the existing five packs are at zero.

Then:

```bash
npm run content:seed
```

Safe to run as many times as you like — it updates in place rather than
duplicating.

---

## How long it takes, honestly

**40 to 60 minutes per concept**, done properly. Eight to twelve concepts per
chapter, so **8 to 10 hours per chapter**.

Most of that is not writing. It is producing four misconceptions that are real,
two worked examples whose arithmetic is right, and a hook set in a world a
student in Kanpur actually lives in.

If your first concept takes three hours, that is normal. If it still takes three
hours at the fifth, the format is fighting you and it is worth saying so.

---

## Using the model for a first draft

```bash
node --import ./scripts/register-alias.mjs scripts/author-concept.ts \
  --chapter "Rational Numbers" \
  --topic "Additive Inverse" \
  --concept "Additive inverse" \
  --id c8-math-ch1-t2-c1 \
  --topic-ref c8-math-ch1-t2 \
  --out content/draft.json
```

It writes a draft, checks every calculation exactly, and reports what is wrong
with it.

**It cannot tell whether the misconceptions are real.** That is the one part of
this job a model is bad at and you are good at, and it is the part that makes
the difference. Treat the draft as something to correct, not something to
approve.

Nothing it writes can go live without a person publishing it. There is no path
from the model to the curriculum that skips you, and that is deliberate.

### A whole topic, questions included

`author-concept.ts` drafts the concept. `author-pack.ts` drafts the concept
*and* the questions that catch its misconceptions, and writes a whole pack:

```bash
npm run author:pack -- --book gp \
  --chapter-no 1 --chapter "A Square and A Cube" \
  --topic-no 1 --topic "Square Numbers and Their Patterns" \
  --concept "What makes a number a perfect square"
```

`--book` picks which Class 8 textbook the ids belong to: `legacy` for the old
sixteen-chapter Mathematics book that everything in `content/` was written
against, `gp` for Ganita Prakash. It is not cosmetic. Both books have a chapter
1, the ids are derived from the number, and the seeder upserts on id — without
the flag, Ganita Prakash's "A Square and A Cube" and the old book's "Rational
Numbers" would fight over `c8-math-ch1` and one of them would silently lose.
`--book gp` writes `c8-math-gp-ch1` instead, and `npm run content:validate`
refuses the collision if it ever happens another way.

It writes to `drafts/`, never `content/`.

### What "Clean" means, and what it does not

Two checks run over the questions:

**Substitution.** Exact and free: put the marked answer back into the equation
in the stem and evaluate both sides over fractions. It applies to the algebra
chapters and to almost nothing else.

**A second read.** For every question substitution could not check, a model is
shown the stem and the options — and *not* which option is marked — and asked
to answer it cold. Where it disagrees, or finds a second option that is also
correct, the script says so and exits non-zero.

The second read exists because of what happened without it. On the first
Ganita Prakash chapter, substitution could check 0 of 9 questions, the script
printed "Clean", and the set contained a question asking which number ending
in 4 is *not* a perfect square, offering 4, 14, 64, 144, marking 64 — with a
solution line that said 14. Structure was perfect. Mathematics was wrong.

**"Clean" still does not mean correct.** The second reader is another model and
it misses things: it passed a question asking whether $9^2$ can be a perfect
cube that offered both "No, it's not possible" and "No, only certain perfect
squares can be perfect cubes", where both are true. And on the first four
topics drafted this way, three of them never reached "Clean" in four attempts
each — which is the honest signal. A model that cannot get its own drafts past
its own checker is not a model whose output you should be publishing unread.

Read every question. That is the job the drafting script exists to shorten, not
to replace.

---

## The provenance block

Every file records where it came from and when it was checked:

```json
"provenance": {
  "source": "NCERT Mathematics Class 8, Chapter 1 — additive inverse. The four misconceptions are the ones this topic reliably produces...",
  "verifiedOn": "2026-08-12",
  "note": "m1 is the one that matters..."
}
```

Say where the mathematics came from, and be honest that the misconceptions are
your judgement rather than the textbook's. Someone will read this file in a year
and need to know how much to trust it.

One thing worth naming: NCERT is mid-transition, and chapter **numbers** are
moving even where the mathematics is not. Check the number against the book the
students actually hold before it appears in the app.
