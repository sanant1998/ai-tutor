/* The audit trail, read.
 *
 * ---------------------------------------------------------------------------
 * WHO SEES WHAT
 *
 * A school admin sees their own school's rows and nothing else — the same rule
 * the RLS policy on audit_logs states, restated here because this route uses
 * the service-role key and RLS does not apply to it. `visibility.adminOf` is
 * the filter; without it an org id in a query string reads any customer's
 * trail.
 *
 * The vendor sees everything, including rows with org_id null, which are the
 * platform's own actions.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PAYLOAD IS NOT RETURNED BY DEFAULT
 *
 * `before` and `after` hold the row as it was and as it became — for a student
 * record that is a child's admission number and name. The list does not need
 * it and a list is what gets left open on a shared screen in a school office.
 * It comes back only when a single row is asked for by id.
 */

import { NextResponse } from "next/server";

import { fail } from "@/lib/ai/route";
import { requireContentAccess } from "@/lib/admin/access";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const PAGE = 100;

export async function GET(request: Request) {
  const admin = await requireContentAccess();
  if (!admin.ok) return fail(admin.message, admin.status);
  if (!isAdminConfigured()) return fail("Not configured.", 503);

  const url = new URL(request.url);
  const orgId = url.searchParams.get("orgId");
  const action = url.searchParams.get("action");
  const entityId = url.searchParams.get("entityId");
  const before = url.searchParams.get("before");

  const db = createAdminClient();

  let query = db
    .from("audit_logs")
    .select("id, org_id, actor_id, actor_role, action, entity_type, entity_id, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE);

  if (!admin.visibility.superAdmin) {
    /* An institute with no orgs would otherwise get `in ()`, which PostgREST
       treats as no filter at all — the whole platform's trail. */
    if (admin.visibility.adminOf.length === 0) return NextResponse.json({ entries: [] });
    query = query.in("org_id", admin.visibility.adminOf);
  }

  if (orgId) {
    if (!admin.visibility.superAdmin && !admin.visibility.adminOf.includes(orgId)) {
      return fail("That is not your organisation.", 403);
    }
    query = query.eq("org_id", orgId);
  }

  /* Prefix, so 'licence' finds licence.assign_seats and licence.create. The
     value is escaped for PostgREST's pattern syntax rather than interpolated. */
  if (action) query = query.like("action", `${action.replace(/[%,()]/g, "")}%`);
  if (entityId) query = query.eq("entity_id", entityId);

  /* Keyset pagination on created_at. An offset would drift as new rows arrive
     at the top, which on an append-only table is every page. */
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;

  if (error) {
    return fail("The audit table is missing. Run supabase/comms.sql.", 503);
  }

  const actorIds = [...new Set((data ?? []).map((row) => row.actor_id).filter(Boolean))];
  const orgIds = [...new Set((data ?? []).map((row) => row.org_id).filter(Boolean))];

  const { data: actors } = actorIds.length
    ? await db.from("profiles").select("id, email, first_name").in("id", actorIds)
    : { data: [] };

  const { data: orgs } = orgIds.length
    ? await db.from("orgs").select("id, name").in("id", orgIds)
    : { data: [] };

  const actorName = new Map(
    (actors ?? []).map((row) => [row.id as string, (row.email as string) ?? (row.first_name as string)]),
  );
  const orgName = new Map((orgs ?? []).map((row) => [row.id as string, row.name as string]));

  return NextResponse.json({
    entries: (data ?? []).map((row) => ({
      id: row.id as string,
      at: row.created_at as string,
      /* The id survives when the account is deleted — audit_logs sets actor_id
         null on delete — so the row still proves the action happened. */
      actor: actorName.get(row.actor_id as string) ?? (row.actor_id ? "(deleted account)" : "system"),
      actorRole: row.actor_role as string | null,
      action: row.action as string,
      entityType: row.entity_type as string | null,
      entityId: row.entity_id as string | null,
      org: row.org_id ? (orgName.get(row.org_id as string) ?? "(deleted)") : "platform",
    })),
    /* Null when the page is short, so the client knows there is no more rather
       than asking again and getting the same rows. */
    nextBefore: (data?.length ?? 0) === PAGE ? (data!.at(-1)!.created_at as string) : null,
  });
}
