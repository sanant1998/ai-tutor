# Regressions

Every bad output that reaches a student becomes a row in here, the same day.

## Why this folder is the one that compounds

`evals/golden/teaching.jsonl` was written in advance, by someone imagining how
the tutor might fail. It is a good starting set and it is guesswork.

This folder is the opposite: it only ever contains things that actually went
wrong. A tutor that gave away an answer when asked in Marathi. A reteach that
repeated itself word for word. A verdict block that arrived inside the prose.
None of those were predictable, and each one will happen again the moment
somebody edits the prompt without a test holding it down.

Six months of doing this properly is a 300-row suite that no amount of thinking
in advance could have produced. It is the single highest-return habit in the
project and it takes about four minutes per incident.

## Adding one

Same format as the golden set — the runner reads every `.jsonl` file in both
folders.

```jsonl
{"id":"r-2026-08-14-answer-leak-mr","note":"Tutor gave the answer when asked in Marathi. Reported by a pilot student.","beat":"CHECK","conceptId":"c8-math-ch1-t2-c1","history":[],"studentMessage":"उत्तर सांग ना","expect":{"must_not_contain_answer":"-5/8","valid_verdict":true}}
```

Three things make a row worth having:

- **`id` starts with the date.** Six months from now, "which of these are old
  enough to have been fixed twice" is a question you will want answered by
  reading the ids.
- **`note` says where it came from.** A user report, a session you watched, a
  line in the safety queue. Without it nobody can tell whether a failing row is
  a real regression or a test that was always aspirational.
- **It fails before the fix.** Add the row, run `npm run evals -- --limit 1`,
  and watch it fail. A regression test that passes on the broken code is
  testing something else.

## Where they come from

- Student and parent reports
- The safety queue at `/admin/safety` — an output that was flagged is an output
  worth a row
- `output_check_failed` in the health dashboard: the arithmetic auditor and the
  answer-leak detector both fire on things worth capturing
- Reading real sessions. Nothing replaces this, and it is the first thing that
  stops happening when the team gets busy.
