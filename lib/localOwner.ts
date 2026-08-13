/* Who does the local cache belong to?
 *
 * The rule only, with no storage and no Supabase behind it, so it can be unit
 * tested under plain node — which matters more here than the size of the file
 * suggests. This decides whether one student's streak, exam dates and name get
 * wiped before the next person uses the same phone, and shared devices are the
 * norm in this market rather than an edge case. It is four branches, and
 * getting any of them backwards is either a data leak or a student losing
 * work they did while signed out.
 *
 * lib/repository.ts holds the localStorage plumbing and calls this. */

export type Ownership = "keep" | "wipe" | "adopt";

/* - keep   the cache already belongs to this account; leave it alone.
 * - adopt  nothing worth protecting; record the new owner and keep going.
 * - wipe   it belongs to somebody else; clear it, then record the new owner.
 */
export function ownershipFor(input: {
  /* The account the cache was last claimed for; null if never claimed. */
  owner: string | null;
  /* The account signing in now; null when signed out. */
  next: string | null;
  /* Whether every student key is absent. */
  empty: boolean;
}): Ownership {
  const { owner, next, empty } = input;

  /* Same account — including signed-out staying signed-out. */
  if (owner === next) return "keep";

  /* First run on this device: no owner and nothing stored. Adopting is a
     no-op that simply records who it belongs to from now on. */
  if (owner === null && empty) return "adopt";

  /* An unclaimed cache with work in it, and nobody signing in. This is a
     visitor who used the app before making an account: the work is theirs and
     wiping it would delete what they just did. Left alone, and left unclaimed
     so that the first account to sign in still triggers a wipe rather than
     silently inheriting it. */
  if (owner === null && next === null) return "keep";

  /* Everything else is a change of hands:
       - unclaimed work + an account signing in  → do not let the account
         inherit a stranger's progress and upload it to their row
       - one account → another
       - an account → signed out (sign-out clears anyway; this covers an
         expired session noticed on the next load) */
  return "wipe";
}
