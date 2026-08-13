/* What the school already knows about this child.
 *
 * ---------------------------------------------------------------------------
 * WHY ONBOARDING ASKS FEWER QUESTIONS OF A SCHOOL STUDENT
 *
 * Onboarding asks for board and class. For a child whose school bought the
 * licence, both are already recorded — the org has a board, the section has a
 * class level — and asking anyway is not just five wasted taps.
 *
 * The child can answer WRONGLY. Then their roadmap is built for a class they
 * are not in, the tutor teaches the wrong chapters, and the teacher's heatmap
 * shows them as having done nothing, because nothing they did was against the
 * topics their class is on. Nobody involved can see why: the student's screen
 * looks normal and the teacher's screen looks normal.
 *
 * So the school's answer wins, and the fields are shown rather than asked.
 *
 * ---------------------------------------------------------------------------
 * IT NEVER FAILS THE PAGE
 *
 * Every failure here returns { school: null }, which is the direct-signup case
 * — the parent who found the app, who genuinely has to answer everything. That
 * is also what an unconfigured preview deploy and an unmigrated database look
 * like, and onboarding staying usable in both is the same rule the rest of the
 * app follows. */

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  let supabase;

  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ school: null });
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ school: null });

  /* p_user is not passed. The function defaults to auth.uid(), so the answer
     is scoped to the caller by the database rather than by this route
     remembering to scope it — and a user id in a request body cannot be used
     to read which school somebody else's child attends. */
  const { data, error } = await supabase.rpc("school_defaults");

  if (error || !Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ school: null });
  }

  const row = data[0] as {
    org_name?: string;
    board?: string | null;
    class_level?: number | null;
    section_id?: string | null;
    section_name?: string | null;
  };

  return NextResponse.json({
    school: {
      name: row.org_name ?? null,
      board: row.board ?? null,
      classLevel: row.class_level ?? null,
      sectionId: row.section_id ?? null,
      sectionName: row.section_name ?? null,
    },
  });
}
