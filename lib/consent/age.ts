/* Is this account holder a minor?
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A FUNCTION AND NOT A COLUMN
 *
 * The first attempt was a stored generated column:
 *
 *   generated always as (dob > current_date - interval '18 years') stored
 *
 * Postgres refuses it — `ERROR: 42P17: generation expression is not immutable`
 * — and is right to. A value computed once, at the moment the row was written,
 * would still say "minor" on the morning the student turns eighteen, and would
 * go on saying it for as long as the row existed.
 *
 * Age is not a property of a row. It is a property of a row AND today.
 *
 * ---------------------------------------------------------------------------
 * THE COLUMN WAS NOT PROTECTING ANYTHING EITHER
 *
 * Its stated purpose was that a client could not write it. But `profiles` had
 * a single row-level policy and no column grants, so a student could write
 * `dob` directly — and `account_state` too, which skipped the consent gate
 * outright. The derived column would have faithfully agreed with whatever date
 * of birth they invented.
 *
 * The real fix is in supabase/compliance.sql: `revoke update on profiles` and
 * grant back only first_name, last_name and language. This file is the other
 * half — the rule, computed fresh, wherever it is asked.
 *
 * There is a matching `public.is_minor(date)` in SQL for policies that need it.
 * Two implementations of one rule is a smell; they exist because PostgREST
 * cannot select a function as a column and the app needs the answer in
 * TypeScript. Change one, change both. */

export const ADULT_AGE = 18;

/* A missing date of birth counts as a minor.
 *
 * The population is overwhelmingly under 18, and the two ways of being wrong
 * are not comparable: treating an adult as a minor costs them one extra screen,
 * and treating a minor as an adult means processing a child's data with no
 * lawful basis. */
export function isMinorFromDob(dob: string | null | undefined): boolean {
  if (!dob) return true;

  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return true;

  return ageFrom(born) < ADULT_AGE;
}

/* Whole years, counted the way a person counts them — a birthday later this
   year has not happened yet. Dividing by 365.25 is close enough almost always
   and wrong on exactly the day it matters most. */
export function ageFrom(born: Date, on: Date = new Date()): number {
  let years = on.getFullYear() - born.getFullYear();

  const monthDiff = on.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < born.getDate())) {
    years -= 1;
  }

  return years;
}

/* Rejects the two ends that are always typos, and would otherwise decide
   whether consent is required at all. */
export function plausibleDob(dob: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;

  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return false;

  const age = ageFrom(born);
  return age >= 4 && age <= 100;
}
