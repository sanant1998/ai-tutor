/* Unit tests for the four pieces that are easy to get subtly wrong and
 * impossible to notice when they are:
 *
 *   sanitize   a stop token split across two chunks
 *   verdict    malformed JSON from the model
 *   verify     exact fraction arithmetic
 *   gate       answer-leak detection
 *
 * Run: node scripts/test-core.ts
 *
 * No test framework. These modules have no dependencies to mock and no async
 * behaviour to sequence, so a runner would be more setup than test. The eval
 * harness (evals/run.ts) covers the parts that need a live model. */

import { makeSanitizer, stripVerdict } from "../lib/ai/sanitize.ts";
import { extractVerdict, SAFE_DEFAULT } from "../lib/ai/verdict.ts";
import { auditEquations, checkNumeric, evaluate, formatFraction } from "../lib/math/verify.ts";
import { containsAnswer } from "../lib/safety/leak.ts";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(detail ? `${name}\n      ${detail}` : name);
}

function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  check(name, a === b, `expected ${b}, got ${a}`);
}

/* --------------------------------------------------------------------------
   sanitize
   -------------------------------------------------------------------------- */
{
  /* The bug this file exists for: a stop token arriving in two pieces. */
  const s = makeSanitizer();
  let out = "";
  for (const chunk of ["Additive inverse ka matlab hai sign badalna aur", " bas.</", "s>"]) {
    out += s.push(chunk);
  }
  out += s.flush();
  check("split stop token is removed", !out.includes("</s>"), out);
  check("prose survives", out.includes("sign badalna"), out);

  /* And one that arrives whole. */
  const s2 = makeSanitizer();
  let out2 = s2.push("Theek hai<|im_end|> chalo aage badhte hain, ab ye dekho zara");
  out2 += s2.flush();
  check("whole stop token is removed", !out2.includes("im_end"), out2);

  /* The verdict must never reach the student, including when the opening tag
     straddles a chunk boundary. */
  const s3 = makeSanitizer();
  let out3 = "";
  for (const chunk of ["Shabaash! Bilkul sahi jawab diya tumne.\n\n<verd", 'ict>{"student_understood":true}</verdict>']) {
    out3 += s3.push(chunk);
  }
  out3 += s3.flush();
  check("verdict never streams", !out3.includes("verdict") && !out3.includes("student_understood"), out3);
  check("prose before the verdict survives", out3.includes("Shabaash"), out3);

  /* Nothing may be lost when the stream ends mid-buffer. */
  const s4 = makeSanitizer();
  const out4 = s4.push("Chhota") + s4.flush();
  eq("short reply is not swallowed", out4, "Chhota");

  eq(
    "stripVerdict on a whole reply",
    stripVerdict('Ye lo jawab.\n<verdict>{"a":1}</verdict>'),
    "Ye lo jawab.",
  );
}

/* --------------------------------------------------------------------------
   verdict
   -------------------------------------------------------------------------- */
{
  const good = extractVerdict(
    'Socho zara.\n<verdict>{"student_understood": false, "error_type": "concept", "misconception_id": "m1", "confidence": 0.9, "next_hint": "reciprocal se confuse hai"}</verdict>',
  );
  eq("parses a good verdict", good.error_type, "concept");
  eq("keeps the misconception id", good.misconception_id, "m1");
  eq("keeps confidence", good.confidence, 0.9);

  eq("no verdict at all falls back", extractVerdict("bas prose"), SAFE_DEFAULT);
  eq("broken JSON falls back", extractVerdict("<verdict>{nope</verdict>"), SAFE_DEFAULT);

  /* Truncated by the token limit — the closing tag never arrived. */
  const truncated = extractVerdict(
    '<verdict>{"student_understood": true, "error_type": "none", "misconception_id": null, "confidence": 0.8, "next_hint": ""}',
  );
  eq("recovers an unclosed verdict", truncated.student_understood, true);

  /* An invented error type must not reach the database, where it is a check
     constraint violation and a 500 on a student's screen. */
  const invented = extractVerdict('<verdict>{"error_type": "vibes", "confidence": 2}</verdict>');
  eq("unknown error type becomes none", invented.error_type, "none");
  eq("confidence is clamped", invented.confidence, 1);

  const stringy = extractVerdict('<verdict>{"error_type":"formula","confidence":"0.7"}</verdict>');
  eq("string confidence still parses", stringy.confidence, 0.7);
}

/* --------------------------------------------------------------------------
   math
   -------------------------------------------------------------------------- */
{
  const show = (input: string) => {
    const value = evaluate(input);
    return value ? formatFraction(value) : null;
  };

  eq("adds fractions exactly", show("1/3 + 1/6"), "1/2");
  eq("the case floats get wrong", show("0.1 + 0.2"), "3/10");
  eq("LaTeX frac", show("\\frac{5}{8} + \\frac{-5}{8}"), "0");
  eq("nested and signed", show("-\\frac{11}{4} + \\frac{11}{4}"), "0");
  eq("precedence", show("2 + 3 * 4"), "14");
  eq("brackets", show("(2 + 3) * 4"), "20");
  eq("powers", show("2^3"), "8");
  eq("mixed numeral", show("2 1/2"), "5/2");
  eq("division by zero is not a value", show("5/0"), null);
  eq("symbolic is skipped, not guessed", show("x + 2"), null);
  eq("square roots are out of scope", show("\\sqrt{2}"), null);

  /* The audit is what runs on a live reply. */
  eq(
    "wrong arithmetic is caught",
    auditEquations("To $\\frac{1}{2} + \\frac{1}{3} = \\frac{2}{5}$ hota hai.").length,
    1,
  );
  eq(
    "right arithmetic passes",
    auditEquations("To $\\frac{1}{2} + \\frac{1}{3} = \\frac{5}{6}$ hota hai.").length,
    0,
  );
  eq(
    "chained equalities are all checked",
    auditEquations("$\\frac{7}{9} + \\frac{-7}{9} = \\frac{0}{9} = 0$").length,
    0,
  );
  eq(
    "a symbolic line is left alone",
    auditEquations("Maan lo $x + y = z$ aur $a = b$.").length,
    0,
  );

  /* Numeric marking, including the two slips worth naming. */
  eq("exact match", checkNumeric("-14", { value: -14, tol: 0 }).correct, true);
  eq(
    "fraction typed instead of a decimal",
    checkNumeric("2/3", { value: 0.6667, tol: 0.001 }).correct,
    true,
  );
  eq("sign slip is named", checkNumeric("14", { value: -14, tol: 0 }).signError, true);
  eq(
    "reciprocal is named",
    checkNumeric("0.4", { value: 2.5, tol: 0 }).reciprocalError,
    true,
  );
  eq("a decimal-place slip is named", checkNumeric("140", { value: 14, tol: 0 }).scaleError, true);
  eq("nonsense is just wrong", checkNumeric("banana", { value: 1, tol: 0 }).correct, false);
}

/* --------------------------------------------------------------------------
   answer leak
   -------------------------------------------------------------------------- */
{
  check(
    "leaked answer in LaTeX is caught",
    containsAnswer("Jawab $-\\frac{7}{9}$ hoga.", "-7/9"),
  );
  check(
    "leaked answer written plainly is caught",
    containsAnswer("To answer -7/9 aayega.", "-7/9"),
  );
  check(
    "a hint that does not give it away passes",
    !containsAnswer("Sign badalne se kya hoga, socho.", "-7/9"),
  );
  check(
    "a digit inside another number is not a leak",
    !containsAnswer("Chapter 14 me ye padha tha.", "4"),
  );
  check("the digit itself is a leak", containsAnswer("Jawab 4 hai.", "4"));
}

/* -------------------------------------------------------------------------- */
console.log(`\n${passed} passed, ${failures.length} failed`);

if (failures.length > 0) {
  console.log("");
  failures.forEach((failure) => console.log(`  FAIL  ${failure}`));
  process.exit(1);
}
