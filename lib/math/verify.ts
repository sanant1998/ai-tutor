/* Checking the tutor's arithmetic before a student sees it.

   A tutor that is warm, patient, well-paced and wrong about $\frac{2}{3} +
   \frac{1}{6}$ is worthless, and worse than worthless in a paid product: the
   parent finds out from the exam. Models get school arithmetic right most of
   the time, and "most of the time" is not a standard anyone would accept from
   a human tutor.

   So every equation the tutor writes is checked before it is stored, and a
   wrong one triggers a regeneration.

   ---------------------------------------------------------------------------
   WHY EXACT FRACTIONS AND NOT A FLOAT LIBRARY

   The obvious implementation evaluates both sides as floating point and
   compares with a tolerance of 1e-6. On a chapter about rational numbers that
   is precisely the wrong tool: $\frac{1}{3}$ is not representable, so a
   perfectly correct identity can fail, and a tolerance loose enough to fix
   that will pass genuinely wrong answers that differ in the sixth decimal.

   Everything here is therefore a ratio of two bigints, reduced. $\frac{1}{3} +
   \frac{1}{6} = \frac{1}{2}$ is checked as $\frac{1}{2} = \frac{1}{2}$ and not
   as 0.5000000000000001. There is no tolerance because none is needed.

   Irrational values are out of scope by design. Anything with a square root or
   a trig function returns null and is skipped rather than approximated, which
   keeps the checker silent instead of wrong on Class 9 and 10 material. */

/* --------------------------------------------------------------------------
   Exact rationals
   -------------------------------------------------------------------------- */
export type Fraction = { n: bigint; d: bigint };

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x;
}

export function frac(n: bigint, d: bigint): Fraction | null {
  if (d === 0n) return null;
  const sign = d < 0n ? -1n : 1n;
  const divisor = gcd(n, d) || 1n;
  return { n: (sign * n) / divisor, d: (sign * d) / divisor };
}

const add = (a: Fraction, b: Fraction) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Fraction, b: Fraction) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Fraction, b: Fraction) => frac(a.n * b.n, a.d * b.d);
const div = (a: Fraction, b: Fraction) => (b.n === 0n ? null : frac(a.n * b.d, a.d * b.n));

export const equals = (a: Fraction, b: Fraction) => a.n === b.n && a.d === b.d;

export function toNumber(value: Fraction) {
  return Number(value.n) / Number(value.d);
}

export function formatFraction(value: Fraction) {
  return value.d === 1n ? String(value.n) : `${value.n}/${value.d}`;
}

/* --------------------------------------------------------------------------
   Parsing

   A small recursive-descent evaluator over the subset of notation that appears
   in Class 8 material: integers, decimals, \frac{a}{b}, + - * / ^, brackets,
   and unary minus. Anything else makes the whole expression unparseable, which
   is the safe outcome — the checker stays quiet rather than guessing.
   -------------------------------------------------------------------------- */
export function evaluate(input: string): Fraction | null {
  const source = normalise(input);
  if (!source) return null;

  let at = 0;

  const peek = () => source[at];
  const eat = (char: string) => {
    if (source[at] === char) {
      at += 1;
      return true;
    }
    return false;
  };

  /* expression := term (('+' | '-') term)* */
  const expression = (): Fraction | null => {
    const first = term();
    if (!first) return null;

    /* A separate, explicitly non-null accumulator. Reassigning the narrowed
       variable inside the loop widens it back to `Fraction | null` at the top
       of the next iteration, and the operand types then depend on the result
       type — which TypeScript reads as circular. */
    let acc: Fraction = first;

    while (peek() === "+" || peek() === "-") {
      const operator = source[at];
      at += 1;
      const right = term();
      if (!right) return null;
      const combined = operator === "+" ? add(acc, right) : sub(acc, right);
      if (!combined) return null;
      acc = combined;
    }

    return acc;
  };

  /* term := power (('*' | '/') power)* */
  const term = (): Fraction | null => {
    const first = power();
    if (!first) return null;

    let acc: Fraction = first;

    while (peek() === "*" || peek() === "/") {
      const operator = source[at];
      at += 1;
      const right = power();
      if (!right) return null;
      const combined = operator === "*" ? mul(acc, right) : div(acc, right);
      if (!combined) return null;
      acc = combined;
    }

    return acc;
  };

  /* power := unary ('^' unary)?  — integer exponents only. */
  const power = (): Fraction | null => {
    const base = unary();
    if (!base) return null;
    if (!eat("^")) return base;

    const exponent = unary();
    if (!exponent || exponent.d !== 1n) return null;

    /* A big exponent on a fraction produces an enormous bigint for no benefit;
       nothing in school arithmetic needs it. */
    const index = exponent.n;
    if (index > 64n || index < -64n) return null;

    let result: Fraction = { n: 1n, d: 1n };
    const times = index < 0n ? -index : index;

    for (let i = 0n; i < times; i += 1n) {
      const next = mul(result, base);
      if (!next) return null;
      result = next;
    }

    return index < 0n ? div({ n: 1n, d: 1n }, result) : result;
  };

  const unary = (): Fraction | null => {
    if (eat("-")) {
      const value = unary();
      return value ? frac(-value.n, value.d) : null;
    }
    if (eat("+")) return unary();
    return atom();
  };

  const atom = (): Fraction | null => {
    if (eat("(")) {
      const value = expression();
      if (!value || !eat(")")) return null;
      return value;
    }

    const digits = /^\d+(?:\.\d+)?/.exec(source.slice(at));
    if (!digits) return null;
    at += digits[0].length;

    return fromDecimal(digits[0]);
  };

  const value = expression();

  /* Trailing junk means we understood only part of it, which is not the same
     as understanding it. */
  return at === source.length ? value : null;
}

/* "0.75" as 75/100, reduced — never as a float. */
function fromDecimal(text: string): Fraction | null {
  const [whole, decimals] = text.split(".");
  if (!decimals) return frac(BigInt(whole), 1n);
  return frac(BigInt(whole + decimals), 10n ** BigInt(decimals.length));
}

/* LaTeX and the ways a model writes maths in prose, reduced to the grammar
   above. \frac{a}{b} becomes (a)/(b) so precedence survives. */
function normalise(input: string): string {
  let text = input
    .replace(/\\left|\\right/g, "")
    .replace(/\\times|\\cdot|×/g, "*")
    .replace(/\\div|÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/\\!|\\,|\\;|\\ /g, "")
    .replace(/[{}$]/g, (match) => (match === "$" ? "" : match));

  /* Innermost first, so nested fractions resolve. */
  for (let pass = 0; pass < 6; pass += 1) {
    const next = text.replace(
      /\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,
      (_, a: string, b: string) => `(${a})/(${b})`,
    );
    if (next === text) break;
    text = next;
  }

  /* Mixed numerals: "2 1/2" is two and a half, not two times a half. Written
     explicitly because getting it wrong flags correct maths as an error. */
  text = text.replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g, "($1+$2/$3)");

  text = text.replace(/[{}]/g, "").replace(/\s+/g, "");

  /* Implicit multiplication before a bracket: 2(3+4). */
  text = text.replace(/(\d)\(/g, "$1*(").replace(/\)(\d)/g, ")*$1");

  return /^[\d+\-*/^().]*$/.test(text) && text.length > 0 ? text : "";
}

/* --------------------------------------------------------------------------
   Auditing the tutor's prose

   Splits a reply into candidate equations and checks each. Anything that
   cannot be parsed is skipped: silence on a symbolic step is correct
   behaviour, since claiming "x + 2 = 5 is wrong" would be far worse than
   saying nothing.
   -------------------------------------------------------------------------- */
export type BadEquation = { claim: string; left: string; right: string; actual: string };

export function auditEquations(text: string): BadEquation[] {
  const bad: BadEquation[] = [];

  /* One equation per chain segment: "a = b = c" is checked as a=b and b=c. */
  for (const candidate of splitCandidates(text)) {
    const parts = candidate.split("=").map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    for (let i = 0; i < parts.length - 1; i += 1) {
      const left = evaluate(parts[i]);
      const right = evaluate(parts[i + 1]);

      /* Either side unparseable — symbolic, or notation we do not cover. */
      if (!left || !right) continue;

      if (!equals(left, right)) {
        bad.push({
          claim: `${parts[i]} = ${parts[i + 1]}`,
          left: formatFraction(left),
          right: formatFraction(right),
          actual: formatFraction(left),
        });
      }
    }
  }

  return bad;
}

function splitCandidates(text: string): string[] {
  const found: string[] = [];

  /* Inside $...$ first — that is where a well-behaved reply puts its maths. */
  for (const match of text.matchAll(/\$([^$]+)\$/g)) {
    found.push(match[1]);
  }

  /* And bare arithmetic in prose, which models write anyway however firmly
     they are told not to. */
  const withoutMath = text.replace(/\$[^$]*\$/g, " ");
  for (const match of withoutMath.matchAll(/[-\d(][\d\s+\-*/^().]*=[\d\s+\-*/^().-]+/g)) {
    found.push(match[0]);
  }

  return found;
}

/* --------------------------------------------------------------------------
   Marking a numeric answer

   Used by the practice evaluator. `tol` of 0 means exact, which is what the
   fraction work wants; a non-zero tolerance is for answers a student is asked
   to round.
   -------------------------------------------------------------------------- */
export type NumericCheck = {
  correct: boolean;
  /* Set when the answer is the right magnitude with the wrong sign. That is a
     careless slip and not a concept gap, and the two deserve different
     responses. */
  signError: boolean;
  /* Set when the answer is the reciprocal of the right one — on this chapter
     that is the additive/multiplicative inverse confusion, every time. */
  reciprocalError: boolean;
  /* Off by a power of ten: a decimal-place slip. */
  scaleError: boolean;
};

export function checkNumeric(
  given: string,
  expected: { value: number; tol: number },
): NumericCheck {
  const parsed = evaluate(given);
  const value = parsed ? toNumber(parsed) : Number(given.trim());

  const miss: NumericCheck = {
    correct: false,
    signError: false,
    reciprocalError: false,
    scaleError: false,
  };

  if (!Number.isFinite(value)) return miss;

  const within = (a: number, b: number) =>
    expected.tol === 0 ? a === b : Math.abs(a - b) <= expected.tol;

  if (within(value, expected.value)) {
    return { ...miss, correct: true };
  }

  if (expected.value !== 0 && within(value, -expected.value)) {
    return { ...miss, signError: true };
  }

  if (expected.value !== 0 && value !== 0) {
    const reciprocal = 1 / expected.value;
    /* A reciprocal comparison cannot be exact — 1/3 is not representable — so
       this one check is relative, at a tolerance far tighter than any real
       answer gap. */
    if (Math.abs(value - reciprocal) <= Math.max(expected.tol, Math.abs(reciprocal) * 1e-9)) {
      return { ...miss, reciprocalError: true };
    }

    for (const factor of [10, 100, 0.1, 0.01]) {
      if (within(value, expected.value * factor)) {
        return { ...miss, scaleError: true };
      }
    }
  }

  return miss;
}

/* --------------------------------------------------------------------------
   Is the option marked correct actually correct?
   -------------------------------------------------------------------------- */

/* Only the three fields the check reads. A DraftQuestion satisfies it, and so
   does anything else with a stem and options — which is the point: this needs
   to be callable from a test without building a whole draft. */
export type MarkedQuestion = {
  stem: string;
  options: { key: string; text: string }[];
  correct: string[];
};

/* Substitution, not solving. Put the marked value back into the equation and
 * evaluate both sides exactly, over the fractions above.
 *
 * This is the check that matters and the one a structural pass cannot make. A
 * draft came back structurally perfect — eight questions, every distractor
 * mapped, levels spread — and three of the first four had the wrong option
 * marked correct. In each case the solution text stated a value that was not
 * the marked option, and in two of them the true answer was not even offered.
 * The script printed "Clean".
 *
 * It cannot check a word problem or a "what is the first step" question, and
 * it says so rather than passing them quietly — the count of what could not be
 * checked is part of the report.
 *
 * Lives here rather than in scripts/author-pack.ts, where it was written,
 * because there it was unreachable from the test suite. It sat for a while
 * with its `\bx\b` word boundaries corrupted into two literal backspace bytes
 * by a JSON round-trip, so bare-x equations silently never substituted and
 * every one of them came back "unverifiable". A test would have said so on the
 * first run; nothing could import it, so nothing did. */
export function checkMarkedAnswer(
  question: MarkedQuestion,
): "ok" | "wrong" | "unverifiable" {
  const marked = question.options.find((option) => question.correct.includes(option.key));
  if (!marked) return "unverifiable";

  /* The equation: the first $...$ span in the stem holding an = and an x. */
  const spans = question.stem.match(/\$[^$]+\$/g) ?? [];
  const equation = spans
    .map((span) => span.slice(1, -1))
    .find((span) => span.includes("=") && /x/.test(span));

  if (!equation) return "unverifiable";

  const [left, right] = equation.split("=");
  if (!left || !right) return "unverifiable";

  const value = evaluate(marked.text.replace(/\$/g, "").trim());
  if (!value) return "unverifiable";

  /* Implicit multiplication is how the notation is written: 3x, not 3*x. The
     coefficient form goes first so that the bare-x pass cannot eat the x out
     of "3x" and leave a dangling 3. */
  const substitute = (side: string) =>
    side
      .replace(/(\d)\s*x/g, `$1*(${formatFraction(value)})`)
      .replace(/\bx\b/g, `(${formatFraction(value)})`);

  const lhs = evaluate(substitute(left));
  const rhs = evaluate(substitute(right));

  if (!lhs || !rhs) return "unverifiable";

  return equals(lhs, rhs) ? "ok" : "wrong";
}
