/* Who did what to whose school.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS A HELPER RATHER THAN AN INSERT AT EACH CALL SITE
 *
 * An audit trail is only worth having if it is complete, and completeness is a
 * property of the boring fields — the ones every route would otherwise write
 * slightly differently. The actor's role, the IP, the user agent: three lines
 * each time, forgotten once, and the row that matters is the one missing them.
 *
 * comms.sql has record_audit() for the same reason at the database end. This
 * is the layer above it: it knows about the Request, which Postgres does not.
 *
 * ---------------------------------------------------------------------------
 * IT DOES NOT THROW, AND THAT IS A CHOICE
 *
 * A failed audit write does not fail the operation. The alternative — the
 * console refusing to enrol a class because the log table is missing — trades
 * a gap in a record for a school that cannot use the product this morning, and
 * that is the wrong way round for something the customer notices immediately.
 *
 * The failure goes to reportError instead, which is where anything nobody is
 * looking at goes. If the trail ever becomes a contractual obligation rather
 * than a sales answer, this is the line to revisit — and it is one line. */

import "server-only";

import { reportError } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuditEntry = {
  orgId: string | null;
  actorId: string | null;
  /* What they were AT THE TIME. Copied in rather than joined out, because a
     teacher who is later made an org admin must not retroactively have been
     one when they did this. */
  actorRole: string;
  action: string;
  entityType?: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

/* Vercel and most proxies put the client on x-forwarded-for as a chain; the
   first entry is the caller and the rest are the hops. */
function callerIp(request?: Request): string | null {
  if (!request) return null;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();

  return request.headers.get("x-real-ip");
}

export async function recordAudit(entry: AuditEntry, request?: Request): Promise<void> {
  try {
    const db = createAdminClient();

    const { error } = await db.rpc("record_audit", {
      p_org: entry.orgId,
      p_actor: entry.actorId,
      p_actor_role: entry.actorRole,
      p_action: entry.action,
      p_entity_type: entry.entityType ?? null,
      p_entity_id: entry.entityId ?? null,
      p_before: entry.before ?? null,
      p_after: entry.after ?? null,
      p_ip: callerIp(request),
      p_user_agent: request?.headers.get("user-agent") ?? null,
    });

    if (error) throw new Error(error.message);
  } catch (error) {
    await reportError("recordAudit", error, { action: entry.action });
  }
}
