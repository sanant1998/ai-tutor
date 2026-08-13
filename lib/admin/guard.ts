/* Who may touch the curriculum.
 *
 * ---------------------------------------------------------------------------
 * AN ENV ALLOWLIST, NOT A ROLE COLUMN
 *
 * A `profiles.is_admin` flag is one UPDATE away from being set by anything
 * that can write to profiles — a bug in an onboarding route, a mis-scoped RLS
 * policy, a support script. And the thing being protected here is the
 * curriculum: someone who can publish content can change what every student in
 * the product is taught.
 *
 * An allowlist in the environment cannot be escalated to from inside the
 * database at all. It does not scale past a handful of people, which is
 * correct for now and is the point at which a real roles table with an audit
 * trail becomes worth building — not before.
 *
 * ADMIN_EMAILS=someone@example.com,another@example.com */

import "server-only";

import { createClient } from "@/lib/supabase/server";

export type AdminCheck =
  | { ok: true; userId: string; email: string }
  | { ok: false; status: number; message: string };

function allowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function adminConfigured() {
  return allowlist().length > 0;
}

/* Is this address the vendor's?
 *
 * Exported so lib/roles.ts can answer "which of the three roles is this"
 * without a second copy of the parsing. An empty allowlist means nobody, the
 * same as it does in requireAdmin below — the failure mode of the other choice
 * is every signed-in account being a super admin on a fresh deployment. */
export function isAllowlistedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowlist().includes(email.toLowerCase());
}

export async function requireAdmin(): Promise<AdminCheck> {
  const allowed = allowlist();

  /* Empty allowlist means nobody, not everybody. The failure mode of the other
     choice is an open content console on a fresh deployment. */
  if (allowed.length === 0) {
    return {
      ok: false,
      status: 503,
      message:
        "No ADMIN_EMAILS configured. Set it to the addresses allowed to publish curriculum.",
    };
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { ok: false, status: 503, message: "Accounts are not configured." };
  }

  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();

  if (!data.user || !email) {
    return { ok: false, status: 401, message: "Sign in first." };
  }

  if (!allowed.includes(email)) {
    /* 404, not 403. An admin console that confirms its own existence to a
       signed-in student is a console someone will keep poking at. */
    return { ok: false, status: 404, message: "Not found." };
  }

  return { ok: true, userId: data.user.id, email };
}
