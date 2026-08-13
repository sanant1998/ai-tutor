/* A parent account, and the link to their child.
 *
 * ---------------------------------------------------------------------------
 * WHY THE LINK IS CONFIRMED BY THE STUDENT
 *
 * The consent flow verifies a phone number. That is enough to authorise
 * processing — it is the standard the Act asks for — but it is not enough to
 * hand someone a continuing view of a child's progress. A digit typed wrongly
 * would send one family's weekly report to another for as long as nobody
 * noticed.
 *
 * So a parent asks, and the student's own account confirms. Both sides have to
 * act. It costs the parent one extra tap and removes the failure mode where a
 * link is created by a typo and never reviewed.
 *
 * ---------------------------------------------------------------------------
 * WHAT A LINK GRANTS
 *
 * The weekly digest, and the statutory data rights: export and erasure. Not
 * the transcript — /api/parent/report deliberately omits it, and the reason is
 * in lib/parent/report.ts. A student who knows the conversation is read stops
 * being honest with it, and an honest conversation is the product. */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { normalisePhone } from "@/lib/consent/otp";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/* GET — every link this account is on, from either side. */
export async function GET() {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) return fail("Not configured.", 503);

  const admin = createAdminClient();

  const [{ data: asParent }, { data: asStudent }] = await Promise.all([
    admin
      .from("parent_links")
      .select("student_id, relation, confirmed, created_at")
      .eq("parent_id", user.value),
    admin
      .from("parent_links")
      .select("parent_id, relation, confirmed, created_at")
      .eq("student_id", user.value),
  ]);

  /* Names, so neither screen shows a bare uuid. Only the first name — a full
     name is more than either side needs to recognise the other. */
  const ids = [
    ...(asParent ?? []).map((row) => row.student_id as string),
    ...(asStudent ?? []).map((row) => row.parent_id as string),
  ];

  const names = new Map<string, string>();

  if (ids.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, first_name")
      .in("id", ids);

    for (const profile of profiles ?? []) {
      names.set(profile.id as string, (profile.first_name as string) || "");
    }
  }

  return NextResponse.json({
    children: (asParent ?? []).map((row) => ({
      studentId: row.student_id as string,
      name: names.get(row.student_id as string) ?? "",
      relation: row.relation as string,
      confirmed: Boolean(row.confirmed),
    })),
    /* Requests waiting on this student's confirmation. This is what puts the
       banner on the student's dashboard. */
    pendingForMe: (asStudent ?? [])
      .filter((row) => !row.confirmed)
      .map((row) => ({
        parentId: row.parent_id as string,
        name: names.get(row.parent_id as string) ?? "",
        relation: row.relation as string,
        requestedAt: row.created_at as string,
      })),
    parents: (asStudent ?? [])
      .filter((row) => row.confirmed)
      .map((row) => ({
        parentId: row.parent_id as string,
        name: names.get(row.parent_id as string) ?? "",
        relation: row.relation as string,
      })),
  });
}

/* POST — a parent asks to be linked to a student. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) return fail("Not configured.", 503);

  let body: { studentPhone?: string; studentEmail?: string; relation?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const admin = createAdminClient();

  /* Look the student up by whatever the parent has. Not by uuid: a parent does
     not have one, and an endpoint that accepts one is an endpoint that gets
     enumerated. */
  let studentId: string | null = null;

  if (body.studentEmail) {
    /* profiles.email, not auth.admin.listUsers(). The admin listing is
       paginated at fifty and silently returns nothing for the fifty-first
       account — a bug that cannot be seen in development and appears the
       week a school signs up. */
    const { data } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", String(body.studentEmail).trim())
      .maybeSingle();

    studentId = (data?.id as string | undefined) ?? null;
  } else if (body.studentPhone) {
    const phone = normalisePhone(body.studentPhone);
    if (!phone) return fail("Ye number theek nahi lag raha.", 400);

    /* Phone sign-in is not enabled on this project, so there is no profile
       column to match against. Kept as an explicit "not supported" rather
       than a silent miss that reads to a parent as "no such account". */
    return fail(
      "Abhi sirf email se jod sakte hain. Bachche ke account ka email daaliye.",
      400,
    );
  } else {
    return fail("Student ka email ya phone number chahiye.", 400);
  }

  /* Same response whether the account exists or not. A different one turns
     this into a way to test whether an address is registered. */
  const generic = NextResponse.json({
    requested: true,
    note:
      "Agar ye account maujood hai to student ko confirm karne ka request bhej diya gaya hai. Unke confirm karte hi report aana shuru ho jaayega.",
  });

  if (!studentId || studentId === user.value) return generic;

  await admin.from("parent_links").upsert(
    {
      parent_id: user.value,
      student_id: studentId,
      relation: body.relation ?? "parent",
      confirmed: false,
    },
    { onConflict: "parent_id,student_id", ignoreDuplicates: true },
  );

  /* The parent's own account is not a student account. Marked so the app shell
     shows them the parent view rather than a revision timetable. */
  await admin.from("profiles").update({ role: "parent" }).eq("id", user.value);

  return generic;
}

/* PATCH — the student confirms or refuses. */
export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) return fail("Not configured.", 503);

  let body: { parentId?: string; confirm?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  if (!body.parentId) return fail("parentId is required.", 400);

  const admin = createAdminClient();

  /* Scoped to student_id = the caller. A student can only ever confirm a link
     that points at themselves, whatever they put in the body. */
  if (body.confirm === false) {
    await admin
      .from("parent_links")
      .delete()
      .eq("parent_id", body.parentId)
      .eq("student_id", user.value);

    return NextResponse.json({ confirmed: false, removed: true });
  }

  const { error } = await admin
    .from("parent_links")
    .update({ confirmed: true })
    .eq("parent_id", body.parentId)
    .eq("student_id", user.value);

  if (error) return fail("Confirm nahi ho paaya.", 500);

  return NextResponse.json({ confirmed: true });
}
