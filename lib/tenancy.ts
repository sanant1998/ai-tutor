/* Which curriculum a person is allowed to see.
 *
 * ---------------------------------------------------------------------------
 * ROW-LEVEL SECURITY DOES NOT COVER THE SERVER
 *
 * supabase/tenancy.sql scopes every curriculum table by org, and that protects
 * the browser completely.
 *
 * It protects the server not at all. The service-role key bypasses RLS by
 * design — it has to, because the question bank's answers are readable by
 * nobody else — and almost every curriculum read in this app is a server read.
 * So tenant isolation on the server is a code obligation, and this file is it.
 *
 * The failure is silent and total: one institute's students see another's
 * material, nothing errors, and the first person to notice is a customer.
 *
 * The rule: any service-role query touching subjects, chapters, topics,
 * concepts or bank_questions goes through `visibleTo` or `scoped`. If you find
 * one that does not, that is a bug, not a shortcut.
 *
 * ---------------------------------------------------------------------------
 * NULL MEANS SHARED
 *
 *   org_id IS NULL   the base curriculum, written by the vendor, everyone sees
 *   org_id = <uuid>  written by that org, only its members see it
 *
 * So the filter is always "mine OR shared", never just "mine" — a student at
 * an institute is meant to get both. */

import "server-only";

import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export type Visibility = {
  /* Orgs this person belongs to, in any role. */
  orgIds: string[];
  /* Orgs they can publish curriculum into. */
  adminOf: string[];
  /* Set for the vendor's own staff, from ADMIN_EMAILS. They see everything —
     which is the point of a super admin and the reason it is an environment
     list rather than a database row. */
  superAdmin: boolean;
};

export async function visibleTo(
  userId: string,
  options: { superAdmin?: boolean } = {},
): Promise<Visibility> {
  if (!isAdminConfigured()) {
    return { orgIds: [], adminOf: [], superAdmin: Boolean(options.superAdmin) };
  }

  const { data } = await createAdminClient()
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", userId);

  const rows = data ?? [];

  return {
    orgIds: rows.map((row) => row.org_id as string),
    adminOf: rows
      .filter((row) => row.role === "org_admin")
      .map((row) => row.org_id as string),
    superAdmin: Boolean(options.superAdmin),
  };
}

/* Applies "shared, or mine" to a PostgREST query.
 *
 * Typed loosely on purpose: the Supabase builder's type changes with every
 * filter and threading it through a generic here produces a signature nobody
 * can read, for no safety that the call sites do not already have. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scoped<T extends { or: (f: string) => T; is: (c: string, v: any) => T }>(
  query: T,
  visibility: Visibility,
): T {
  /* The vendor's staff see every org's material. Nobody else does. */
  if (visibility.superAdmin) return query;

  if (visibility.orgIds.length === 0) {
    /* No org: the base curriculum only. `.is` rather than `.or` because a
       one-sided filter reads clearly in a log and is one less place to get a
       comma wrong. */
    return query.is("org_id", null);
  }

  return query.or(`org_id.is.null,org_id.in.(${visibility.orgIds.join(",")})`);
}

/* Whether one specific piece of content is visible.
 *
 * For the paths that have already fetched a row and need to check it rather
 * than filter a list — a session resuming on a topic, a question being marked. */
export function canSee(orgId: string | null | undefined, visibility: Visibility): boolean {
  if (visibility.superAdmin) return true;
  if (!orgId) return true;
  return visibility.orgIds.includes(orgId);
}

/* Where a new draft or seeded row belongs.
 *
 * An org admin publishes into their own org and nowhere else, however the
 * request is shaped. A super admin may target an org explicitly, and defaults
 * to the shared base curriculum. */
export function targetOrg(
  requested: string | null | undefined,
  visibility: Visibility,
): { orgId: string | null } | { error: string } {
  if (visibility.superAdmin) {
    return { orgId: requested ?? null };
  }

  if (visibility.adminOf.length === 0) {
    return { error: "You do not administer any organisation." };
  }

  if (requested && !visibility.adminOf.includes(requested)) {
    return { error: "That is not your organisation." };
  }

  /* Ignoring a requested null rather than honouring it: only the vendor writes
     the shared curriculum, and an org admin posting org_id: null would
     otherwise publish into everyone's product. */
  return { orgId: requested ?? visibility.adminOf[0] };
}

/* Whether this org has bought the right to write its own material. Some plans
   are "use the vendor's content with your students" and nothing more, which is
   a commercial line rather than a technical one. */
export async function canAuthor(orgId: string): Promise<boolean> {
  if (!isAdminConfigured()) return false;

  const { data } = await createAdminClient()
    .from("orgs")
    .select("can_author, expires_at")
    .eq("id", orgId)
    .maybeSingle();

  if (!data?.can_author) return false;
  if (data.expires_at && new Date(data.expires_at as string) < new Date()) return false;

  return true;
}
