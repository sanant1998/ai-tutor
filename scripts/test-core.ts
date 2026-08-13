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
import {
  auditEquations,
  checkMarkedAnswer,
  checkNumeric,
  evaluate,
  formatFraction,
} from "../lib/math/verify.ts";
import { checkOutput, containsAnswer } from "../lib/safety/leak.ts";
import type { ContentFile } from "../lib/content/pack.ts";
import { validateCollection } from "../lib/content/validate.ts";
import { ownershipFor } from "../lib/localOwner.ts";
import { levelSplit } from "../lib/mastery.ts";
import { APP_NAV, navFor } from "../lib/nav.ts";
import {
  canOpen,
  homeFor,
  isStoredRole,
  roleFrom,
  STORED_ROLES,
} from "../lib/roles.ts";

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

  /* The case the two tests above both missed.
   *
   * Both feed the marker inside one large chunk, which is the one shape the
   * old implementation handled: it cleaned the outgoing slice, and a big chunk
   * puts the whole marker inside one slice. Real providers stream a few
   * characters at a time, the marker lands across two slices, and five of the
   * six markers went straight through to the student.
   *
   * So this drives every marker through a stream chopped into pieces smaller
   * than the marker itself, which is the condition that broke it. */
  {
    const markers = [
      "</s>",
      "<|im_end|>",
      "<|endoftext|>",
      "<|eot_id|>",
      "[/INST]",
      "<|end_header_id|>",
      "<|start_header_id|>",
    ];

    for (const size of [1, 3, 4, 7]) {
      for (const marker of markers) {
        const source = `Rational number ka matlab ${marker} samajh gaye na? Chalo aage.`;
        const sanitizer = makeSanitizer();

        let out = "";
        for (let i = 0; i < source.length; i += size) {
          out += sanitizer.push(source.slice(i, i + size));
        }
        out += sanitizer.flush();

        check(
          `stop token ${marker} is removed at chunk size ${size}`,
          !out.includes(marker),
          out,
        );
        check(
          `prose survives ${marker} at chunk size ${size}`,
          out.includes("Rational number ka matlab") && out.includes("Chalo aage."),
          out,
        );
      }
    }
  }

  /* A stream that dies mid-marker leaves a fragment nothing will ever
     complete. It must not be shown. */
  {
    const s = makeSanitizer();
    let out = "";
    for (const chunk of ["Theek hai, ab ye dekho zara dhyaan se", " <|start_head"]) {
      out += s.push(chunk);
    }
    out += s.flush();
    check("a truncated stop token is not shown", !out.includes("<|start_head"), out);
    check("prose before a truncated token survives", out.includes("dhyaan se"), out);
  }

  /* ...but prose that merely ends in a "<" keeps it. */
  {
    const s = makeSanitizer();
    const out = s.push("5 < 8 hai, aur 3 <") + s.flush();
    eq("a bare angle bracket is not eaten", out, "5 < 8 hai, aur 3 <");
  }

  /* The verdict, driven one character at a time. */
  {
    const source = 'Shabaash!\n\n<verdict>{"student_understood":true}</verdict>';
    const s = makeSanitizer();

    let out = "";
    for (const character of source) out += s.push(character);
    out += s.flush();

    check(
      "verdict never streams, one character at a time",
      !out.includes("verdict") && !out.includes("student_understood"),
      out,
    );
    check("prose survives a character-at-a-time verdict", out.includes("Shabaash!"), out);
  }

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
   the marked answer, checked by substitution

   This block exists because of a bug that lived a while: the bare-x pattern's
   `\b` word boundaries had been through a JSON round-trip and arrived as two
   literal backspace bytes, so the pattern matched nothing, no substitution
   happened, and every bare-x equation quietly came back "unverifiable". The
   drafting script printed a clean report over unchecked answers.

   Nothing caught it because the function lived inside a CLI script that no
   test could import. It lives in lib/math/verify.ts now, and the first case
   below is the one that fails the moment those boundaries break again.
   -------------------------------------------------------------------------- */
{
  const q = (stem: string, answer: string) => ({
    stem,
    options: [
      { key: "A", text: answer },
      { key: "B", text: "$0$" },
      { key: "C", text: "$1$" },
      { key: "D", text: "$2$" },
    ],
    correct: ["A"],
  });

  /* Bare x on its own — the case the corruption silently skipped. */
  eq(
    "a bare-x equation is actually checked",
    checkMarkedAnswer(q("Solve $x + 5 = 12$", "$7$")),
    "ok",
  );
  eq(
    "a bare-x equation with the wrong option marked is caught",
    checkMarkedAnswer(q("Solve $x + 5 = 12$", "$8$")),
    "wrong",
  );

  /* Implicit multiplication, and the ordering that keeps the bare-x pass from
     eating the x out of "3x". */
  eq(
    "a coefficient equation is checked",
    checkMarkedAnswer(q("Solve $3x = 12$", "$4$")),
    "ok",
  );
  eq(
    "a coefficient equation with a wrong answer is caught",
    checkMarkedAnswer(q("Solve $3x = 12$", "$36$")),
    "wrong",
  );
  eq(
    "x on both sides is checked",
    checkMarkedAnswer(q("Solve $5x - 3 = 2x + 6$", "$3$")),
    "ok",
  );

  /* A fractional answer has to survive being formatted back into the side. */
  eq(
    "a fractional answer is checked exactly",
    checkMarkedAnswer(q("Solve $2x = 3$", "$\\frac{3}{2}$")),
    "ok",
  );

  /* What it honestly cannot check says so, rather than passing quietly. */
  eq(
    "a word problem is reported unverifiable, not ok",
    checkMarkedAnswer(q("Ravi ke paas kitne rupees hain?", "$40$")),
    "unverifiable",
  );
  eq(
    "an unmarked question is unverifiable",
    checkMarkedAnswer({ stem: "Solve $x + 1 = 2$", options: [{ key: "A", text: "$1$" }], correct: [] }),
    "unverifiable",
  );
}

/* --------------------------------------------------------------------------
   ids across the whole content set

   A chapter is repeated once per topic file, so a repeated chapter id is
   normal — and a repeated chapter id carrying a DIFFERENT chapter is not. The
   case that will actually happen is a second textbook: NCERT replaced the
   Class 8 Mathematics book with Ganita Prakash, whose chapter 1 is not the old
   chapter 1, and both want the id c8-math-ch1.
   -------------------------------------------------------------------------- */
{
  const pack = (
    chapter: { id: string; no: number; title: string },
    topicId: string,
  ): ContentFile => ({
    board: "cbse",
    classLevel: 8,
    subjectId: "maths",
    provenance: { source: "test fixture", verifiedOn: "2026-08-13" },
    subject: { id: "c8-math", name: "Mathematics" },
    chapter,
    topic: { id: topicId, no: 1, title: "A topic", prereqTopicIds: [] },
    concepts: [],
    questions: [],
  });

  const ch1 = { id: "c8-math-ch1", no: 1, title: "Rational Numbers" };

  eq(
    "the same chapter repeated across its topic files is fine",
    validateCollection([pack(ch1, "c8-math-ch1-t1"), pack(ch1, "c8-math-ch1-t2")]).length,
    0,
  );

  const clash = validateCollection([
    pack(ch1, "c8-math-ch1-t1"),
    pack({ id: "c8-math-ch1", no: 1, title: "A Square and A Cube" }, "c8-math-ch1-t9"),
  ]);

  eq("two books claiming one chapter id is an error", clash.length, 1);
  check(
    "and the message names the colliding title",
    clash[0]?.message.includes("A Square and A Cube") === true,
    clash[0]?.message,
  );
  eq("it is an error, not a warning", clash[0]?.severity, "error");
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

  /* The bug this guard exists for.
   *
   * A multiple-choice answer is stored as an option key. Fed in as a needle,
   * "A" matched a standalone "a" in ordinary Hinglish and every CHECK looked
   * like a leak — so every CHECK question was thrown away and replaced by the
   * fallback probe, quietly, on every turn. */
  check(
    "a bare option key is not treated as an answer",
    !containsAnswer("Ab tum batao, iska matlab kya hai?", "A"),
  );
  check(
    "...even lowercase, and even when the letter really is in the text",
    !containsAnswer("Ye ek aasan sa sawal hai.", "a"),
  );
  check(
    "but the option's TEXT is still caught",
    containsAnswer("Jawab $-\\frac{5}{8}$ hai.", "$-\\frac{5}{8}$"),
  );

  /* checkOutput compares against every answer on the concept, because the
     tutor writes its own check question rather than drawing one from the
     bank — so any of the concept's answers is a leak, not just the first. */
  const concept = ["$-\\frac{5}{8}$", "$\\frac{13}{7}$", "0.6667", "2/3"];

  eq(
    "a leak of a later question's answer is caught",
    checkOutput("Simple hai — $\\frac{13}{7}$ aa jaayega.", {
      beat: "CHECK",
      answers: concept,
    }),
    "answer_leak",
  );
  eq(
    "the exact form of a numeric answer is caught",
    checkOutput("Yaani 2/3 hota hai.", { beat: "CHECK", answers: concept }),
    "answer_leak",
  );
  eq(
    "a genuine question gives nothing away",
    checkOutput("Sign badal ke dekho — kya milega?", {
      beat: "CHECK",
      answers: concept,
    }),
    null,
  );
  eq(
    "answers are only withheld during a CHECK",
    checkOutput("Jawab $\\frac{13}{7}$ hai.", { beat: "TEACH", answers: concept }),
    null,
  );
  eq(
    "prompt scaffolding is a leak whatever the beat",
    checkOutput("<content_pack> ke hisaab se...", { beat: "TEACH", answers: [] }),
    "prompt_leak",
  );
}

/* --------------------------------------------------------------------------
   local cache ownership

   The shared family phone. Getting a branch backwards here is either one
   student seeing another's progress, or a signed-out visitor losing the work
   they did before making an account.
   -------------------------------------------------------------------------- */
{
  const A = "user-a";
  const B = "user-b";

  eq("the same account keeps its cache", ownershipFor({ owner: A, next: A, empty: false }), "keep");
  eq("a different account wipes it", ownershipFor({ owner: A, next: B, empty: false }), "wipe");
  eq(
    "signing out of a claimed cache wipes it",
    ownershipFor({ owner: A, next: null, empty: false }),
    "wipe",
  );
  eq(
    "a first run on a clean device just records the owner",
    ownershipFor({ owner: null, next: A, empty: true }),
    "adopt",
  );

  /* The one that protects the second student, and the easiest to get wrong:
     unclaimed local work already on the device, and an account signing in on
     top of it. Adopting would upload a stranger's streak to this account. */
  eq(
    "an account signing in over unclaimed work does not inherit it",
    ownershipFor({ owner: null, next: A, empty: false }),
    "wipe",
  );

  /* ...but a signed-out visitor keeps their own work. */
  eq(
    "a signed-out visitor keeps the work they did signed out",
    ownershipFor({ owner: null, next: null, empty: false }),
    "keep",
  );
  eq(
    "a signed-out visitor on a clean device is a no-op",
    ownershipFor({ owner: null, next: null, empty: true }),
    "keep",
  );
}

/* --------------------------------------------------------------------------
   question ladder

   The difficulty a student picks used to be read, validated and then dropped:
   every set came out the same shape whatever they chose.
   -------------------------------------------------------------------------- */
{
  const total = (split: Record<string, number>) =>
    Object.values(split).reduce((sum, n) => sum + n, 0);

  for (const count of [4, 7, 12, 20]) {
    for (const level of ["foundation", "standard", "stretch"] as const) {
      const split = levelSplit(count, level);
      eq(`a ${level} set of ${count} totals ${count}`, total(split), count);
      check(
        `a ${level} set of ${count} has no negative band`,
        Object.values(split).every((n) => n >= 0),
        JSON.stringify(split),
      );
    }
  }

  const foundation = levelSplit(20, "foundation");
  const standard = levelSplit(20, "standard");
  const stretch = levelSplit(20, "stretch");

  check(
    "foundation weights the bottom of the ladder",
    foundation.L1 > standard.L1 && foundation.L4 < standard.L4,
    JSON.stringify(foundation),
  );
  check(
    "stretch weights the top",
    stretch.L4 > standard.L4 && stretch.L1 < standard.L1,
    JSON.stringify(stretch),
  );

  /* The default has to stay exactly what it was, or every existing set
     silently changes shape the day this ships. */
  eq("the default is unchanged", levelSplit(20), levelSplit(20, "standard"));
  eq("...and is still 6/7/4/3 at twenty", levelSplit(20), { L1: 6, L2: 7, L3: 4, L4: 3 });
}

/* --------------------------------------------------------------------------
   roles

   Three roles, and the default has to fall to the least privileged one. Every
   branch below used to be absent entirely: sign-in sent all three to the
   student dashboard and the sidebar showed one list to everybody.
   -------------------------------------------------------------------------- */
{
  eq(
    "an allowlisted address is a super admin whatever the column says",
    roleFrom({ stored: "student", isSuperAdmin: true }),
    "super_admin",
  );
  eq("a stored teacher is a teacher", roleFrom({ stored: "teacher", isSuperAdmin: false }), "teacher");
  eq("a stored student is a student", roleFrom({ stored: "student", isSuperAdmin: false }), "student");

  /* Everything unrecognised falls to the least privileged role — a null, a
     legacy 'parent' from before roles.sql, a typo in a future writer. Falling
     the other way would hand out a teacher's view of a class. */
  for (const stored of [null, undefined, "", "parent", "Teacher", "admin", "super_admin"]) {
    eq(`"${String(stored)}" reads as a student`, roleFrom({ stored, isSuperAdmin: false }), "student");
  }

  eq("stored roles are exactly two", STORED_ROLES.join(","), "student,teacher");
  check("'parent' is not a storable role", !isStoredRole("parent"));
  check("'super_admin' is not a storable role", !isStoredRole("super_admin"));

  /* Landing pages. */
  eq("a student lands on their plan", homeFor("student"), "/dashboard");
  eq("a teacher lands on their classes", homeFor("teacher"), "/teacher");
  eq("a super admin lands on the console", homeFor("super_admin"), "/admin");

  /* Access. */
  check("a student may open their dashboard", canOpen("student", "/dashboard"));
  check("a student may open a topic they are practising", canOpen("student", "/practice/c8-m-t2"));
  check("a student may NOT open the teacher side", !canOpen("student", "/teacher"));
  check("a student may NOT open a section", !canOpen("student", "/teacher/abc"));
  check("a student may NOT open the admin console", !canOpen("student", "/admin"));
  check("a student may NOT open admin subpages", !canOpen("student", "/admin/safety"));

  check("a teacher may open their classes", canOpen("teacher", "/teacher"));
  check("a teacher may open one section", canOpen("teacher", "/teacher/abc"));
  check("a teacher may NOT open a student's revision plan", !canOpen("teacher", "/dashboard"));
  check("a teacher may NOT open the fix sheet", !canOpen("teacher", "/fix-sheet"));
  check("a teacher may NOT open the admin console", !canOpen("teacher", "/admin"));

  /* The vendor sees the whole product — they have to be able to look at
     whatever is being reported to them. */
  for (const path of ["/dashboard", "/teacher", "/teacher/abc", "/admin", "/fix-sheet", "/settings"]) {
    check(`a super admin may open ${path}`, canOpen("super_admin", path));
  }

  /* Shared screens: an account page or a past paper is nobody's exclusively. */
  for (const role of ["student", "teacher", "super_admin"] as const) {
    for (const path of ["/settings", "/privacy", "/faq", "/papers", "/feedback", "/questions"]) {
      check(`${role} may open ${path}`, canOpen(role, path));
    }
  }

  /* A prefix must not match a longer word: /teacher-notes is not /teacher. */
  check("a prefix does not match a longer path segment", !canOpen("student", "/teacherly"));
}

/* --------------------------------------------------------------------------
   nav
   -------------------------------------------------------------------------- */
{
  const hrefs = (role: Parameters<typeof navFor>[0]) => navFor(role).map((item) => item.href);

  check("a student's sidebar has their plan", hrefs("student").includes("/dashboard"));
  check("a student's sidebar does NOT offer the teacher side", !hrefs("student").includes("/teacher"));
  check("a student's sidebar does NOT offer admin", !hrefs("student").includes("/admin"));

  check("a teacher's sidebar leads with their classes", hrefs("teacher")[0] === "/teacher");
  check(
    "a teacher's sidebar has no personal revision screens",
    !hrefs("teacher").some((href) =>
      ["/dashboard", "/tutor", "/roadmap", "/progress", "/fix-sheet", "/notes"].includes(href),
    ),
  );
  check("a teacher is not sold a student subscription", !hrefs("teacher").includes("/pricing"));

  check("a super admin's sidebar leads with admin", hrefs("super_admin")[0] === "/admin");
  check(
    "a super admin can reach both halves",
    hrefs("super_admin").includes("/teacher") && hrefs("super_admin").includes("/dashboard"),
  );

  /* Every sidebar entry must be one its own role can actually open, or the
     sidebar is offering a link that bounces straight back. */
  for (const role of ["student", "teacher", "super_admin"] as const) {
    for (const href of hrefs(role)) {
      check(`${role}'s sidebar link ${href} is openable by ${role}`, canOpen(role, href));
    }
  }

  /* APP_NAV feeds the signed-in-only list in middleware.ts, so it has to be
     the union of all three with no duplicates. */
  const all = APP_NAV.map((item) => item.href);
  eq("APP_NAV has no duplicates", all.length, new Set(all).size);
  for (const role of ["student", "teacher", "super_admin"] as const) {
    for (const href of hrefs(role)) {
      check(`APP_NAV covers ${href} from ${role}`, all.includes(href));
    }
  }
}

/* -------------------------------------------------------------------------- */
console.log(`\n${passed} passed, ${failures.length} failed`);

/* A suite that runs nothing exits 0 and reads as green.
 *
 * This is not hypothetical: an edit to the block above once removed the
 * summary line along with its anchor, and the file then ran to completion,
 * printed nothing at all, and exited 0. CI would have called that a pass. An
 * import that throws inside a try, a block deleted by a bad merge, a top-level
 * early return — all of them look identical from the outside.
 *
 * The floor is deliberately a real number rather than 1. Passing 1 assertion
 * out of three hundred is the same failure wearing a better disguise. */
const MINIMUM_ASSERTIONS = 250;

if (passed < MINIMUM_ASSERTIONS) {
  console.log(
    `\n  FAIL  only ${passed} assertions ran; expected at least ${MINIMUM_ASSERTIONS}.` +
      "\n        Something above stopped early or was deleted. Raise this floor" +
      "\n        in the same commit that legitimately adds tests.",
  );
  process.exit(1);
}

if (failures.length > 0) {
  console.log("");
  failures.forEach((failure) => console.log(`  FAIL  ${failure}`));
  process.exit(1);
}
