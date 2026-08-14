/* School notices.
 *
 * ---------------------------------------------------------------------------
 * READING GOES THROUGH THE POLICY, WRITING DOES NOT
 *
 * GET uses the caller's own client, so the announcements policy decides what
 * comes back — published, unexpired, their org or platform-wide, and for a
 * section only if they are in it or teach it. That is one definition of "who
 * may read this", in the database, rather than a second one here that would
 * eventually disagree with it.
 *
 * POST uses the service-role key, because there is deliberately no insert
 * policy: a notice reaches every child in a school, and the check for who may
 * write one is org_admin or the section's teacher, done here where the role
 * lookup is cheap.
 *
 * ---------------------------------------------------------------------------
 * A TEACHER CAN ONLY ADDRESS THEIR OWN SECTION
 *
 * teaches_section is asked, not assumed. Without it, "audience: section" plus
 * any section id in the body is a way for one teacher to send a notice to
 * another teacher's class — which is not a data leak, so no policy would catch
 * it, and is exactly the sort of thing that ends a pilot.
 */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { recordAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (!user.ok) return user.response;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, audience, section_id, publish_at, expires_at")
    .order("publish_at", { ascending: false })
    .limit(50);

  if (error) {
    /* Not fatal. A dashboard that fails to render because comms.sql has not
       run is worse than one with no notices on it. */
    return NextResponse.json({ announcements: [] });
  }

  return NextResponse.json({
    announcements: (data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      body: row.body as string,
      audience: row.audience as string,
      sectionId: row.section_id as string | null,
      publishedAt: row.publish_at as string,
      expiresAt: row.expires_at as string | null,
    })),
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;
  if (!isAdminConfigured()) return fail("Not configured.", 503);

  let body: {
    orgId?: string;
    title?: string;
    body?: string;
    audience?: string;
    sectionId?: string | null;
    expiresAt?: string | null;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  if (!body.title?.trim() || !body.body?.trim()) {
    return fail("Both a title and a message are required.", 400);
  }

  if (!body.orgId) return fail("orgId is required.", 400);

  const audience = body.audience ?? "all";

  if (audience === "section" && !body.sectionId) {
    return fail("A section must be chosen, otherwise the notice reaches nobody.", 400);
  }

  const supabase = await createClient();

  /* Who is asking, in this org. Asked through the caller's own client so the
     membership policy applies — a row they cannot see is a row they are not a
     member of. */
  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", body.orgId)
    .eq("user_id", user.value)
    .maybeSingle();

  const isOrgAdmin = membership?.role === "org_admin";

  if (!isOrgAdmin) {
    if (!body.sectionId) {
      return fail("Only a school admin can send a notice to the whole school.", 403);
    }

    const { data: teaches } = await supabase.rpc("teaches_section", { p_section: body.sectionId });

    if (teaches !== true) {
      return fail("This section is not yours.", 403);
    }
  }

  const db = createAdminClient();

  const { data, error } = await db
    .from("announcements")
    .insert({
      org_id: body.orgId,
      section_id: body.sectionId ?? null,
      created_by: user.value,
      title: body.title.trim(),
      body: body.body.trim(),
      audience,
      expires_at: body.expiresAt ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    /* The trigger from comms.sql fires here when the section belongs to
       another school, and its message says so in those words. */
    return fail(`The notice could not be sent: ${error.message}`, 400);
  }

  await recordAudit(
    {
      orgId: body.orgId,
      actorId: user.value,
      actorRole: isOrgAdmin ? "org_admin" : "teacher",
      action: "announcement.create",
      entityType: "announcement",
      entityId: (data?.id as string) ?? null,
      after: { title: body.title.trim(), audience, sectionId: body.sectionId ?? null },
    },
    request,
  );

  return NextResponse.json({ id: data?.id ?? null });
}
