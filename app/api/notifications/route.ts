/* The bell, read and dismissed.
 *
 * Both halves go through the caller's own client. comms.sql gives
 * notifications a select policy scoped to the owner and an update policy with
 * a column grant that allows read_at and nothing else — so "mark as read"
 * cannot become "rewrite the message", and this route does not need to know
 * that to be safe.
 */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (!user.ok) return user.response;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  /* comms.sql not run, or nothing to say. Same answer: the bell is empty and
     no screen breaks. */
  if (error) return NextResponse.json({ notifications: [] });

  return NextResponse.json({
    notifications: (data ?? []).map((row) => ({
      id: row.id as string,
      kind: row.kind as string,
      title: row.title as string,
      body: row.body as string | null,
      link: row.link as string | null,
      at: row.created_at as string,
    })),
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  let body: { ids?: string[] };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const ids = (body.ids ?? []).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ read: 0 });

  const supabase = await createClient();

  /* No student_id filter here on purpose: the policy already limits this to
     the caller's own rows, and adding a second check in application code is
     how the two end up disagreeing. Somebody else's id in this list marks
     nothing. */
  const { data } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .is("read_at", null)
    .select("id");

  return NextResponse.json({ read: data?.length ?? 0 });
}
