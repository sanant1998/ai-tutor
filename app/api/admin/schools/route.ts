/* Setting up a school or coaching centre.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS AN INTERNAL ENDPOINT AND NOT SELF-SERVICE
 *
 * A school signs a contract, agrees a seat count and pays an invoice. There is
 * no version of that flow where a stranger creates an org with 400 seats from
 * a web form. Doing it through the admin console keeps the seat count tied to
 * something that was actually sold, which is the whole commercial model.
 *
 * Self-service is the right shape for the parent buying one subscription. It
 * is the wrong shape for the sale that takes six weeks and a purchase order.
 *
 * ---------------------------------------------------------------------------
 * THE ROSTER IS EMAILS, NOT ACCOUNTS
 *
 * Importing forty students does not create forty accounts. It records who is
 * expected, and the membership is attached when each student signs up with
 * that address. Creating accounts on a school's behalf would mean creating
 * children's accounts with no parental consent behind them, which is exactly
 * what the consent flow exists to prevent — a school cannot consent on a
 * parent's behalf under the DPDP Act. */

import { NextResponse } from "next/server";

import { fail } from "@/lib/ai/route";
import { requireContentAccess } from "@/lib/admin/access";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requireContentAccess();
  if (!admin.ok) return fail(admin.message, admin.status);
  if (!isAdminConfigured()) return fail("Not configured.", 503);

  const db = createAdminClient();

  let orgQuery = db
    .from("orgs")
    .select("id, name, kind, seats, expires_at, created_at, licence_inr, licence_starts_on, can_author")
    .order("created_at", { ascending: false });

  /* An institute sees itself and nothing else. The vendor sees every customer
     — which is also a list of who has bought the product, so this filter is
     the difference between a console and a competitor's prospect list. */
  if (!admin.visibility.superAdmin) {
    orgQuery = orgQuery.in("id", admin.visibility.adminOf);
  }

  const { data: orgs, error } = await orgQuery;

  if (error) {
    return fail("The school tables are missing. Run supabase/schools.sql.", 503);
  }

  const { data: usage } = await db.from("org_seat_usage").select("*");
  const { data: sections } = await db
    .from("sections")
    .select("id, org_id, name, class_level, teacher_id");

  const used = new Map(
    (usage ?? []).map((row) => [row.org_id as string, Number(row.students_enrolled ?? 0)]),
  );

  return NextResponse.json({
    orgs: (orgs ?? []).map((org) => ({
      id: org.id as string,
      name: org.name as string,
      kind: org.kind as string,
      seats: Number(org.seats ?? 0),
      seatsUsed: used.get(org.id as string) ?? 0,
      /* Surfaced because an expired org silently loses every student's access
         through can_access_chapter, and "the whole school stopped working" is
         a call worth pre-empting. */
      expiresOn: org.expires_at as string | null,
      expired: org.expires_at ? new Date(org.expires_at as string) < new Date() : false,
      /* Recorded in March, starts in June: until it starts the org is sold but
         not live, and a console that shows only an expiry date makes that look
         identical to an org that is running. */
      startsOn: org.licence_starts_on as string | null,
      notStartedYet: org.licence_starts_on
        ? new Date(org.licence_starts_on as string) > new Date()
        : false,
      licenceInr: org.licence_inr === null ? null : Number(org.licence_inr),
      canAuthor: org.can_author === true,
      sections: (sections ?? [])
        .filter((section) => section.org_id === org.id)
        .map((section) => ({
          id: section.id as string,
          name: section.name as string,
          classLevel: section.class_level as number | null,
          hasTeacher: Boolean(section.teacher_id),
        })),
    })),
  });
}

export async function POST(request: Request) {
  const admin = await requireContentAccess();
  if (!admin.ok) return fail(admin.message, admin.status);
  if (!isAdminConfigured()) return fail("Not configured.", 503);

  /* Whether this caller may act on this organisation at all. Every branch
     below runs it before touching a row, because the service-role client has
     no row-level security to fall back on — an org id in a request body is
     otherwise a free pass into any customer's roster. */
  const mayTouch = (orgId: string | null | undefined) =>
    Boolean(orgId) &&
    (admin.visibility.superAdmin || admin.visibility.adminOf.includes(orgId!));

  let body: {
    action?:
      | "create_org"
      | "create_section"
      | "import_roster"
      | "assign_teacher"
      | "assign_admin";
    orgId?: string;
    name?: string;
    kind?: string;
    seats?: number;
    expiresOn?: string;
    licenceInr?: number;
    licenceStartsOn?: string;
    billingEmail?: string;
    billingContact?: string;
    canAuthor?: boolean;
    sectionId?: string;
    classLevel?: number;
    emails?: string[];
    teacherEmail?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const db = createAdminClient();

  /* --- A new org -------------------------------------------------------- */
  if (body.action === "create_org") {
    /* The vendor only. An organisation carries a seat count and an expiry that
       came from a signed contract, so a customer creating one would be writing
       their own licence. */
    if (!admin.visibility.superAdmin) {
      return fail("Nayi organisation sirf platform team bana sakti hai.", 403);
    }

    if (!body.name) return fail("name is required.", 400);

    const { data, error } = await db
      .from("orgs")
      .insert({
        name: body.name,
        kind: body.kind === "coaching" ? "coaching" : "school",
        seats: Number(body.seats ?? 0),
        expires_at: body.expiresOn ?? null,
        /* The commercial terms, recorded at the moment they are agreed. An
           org whose licence exists only in somebody's inbox is an org nobody
           can tell is due for renewal. */
        licence_inr: body.licenceInr ?? null,
        licence_starts_on: body.licenceStartsOn ?? null,
        billing_email: body.billingEmail ?? null,
        billing_contact: body.billingContact ?? null,
        /* Off unless the sale included authoring. Defaulting this on would
           mean every customer could write into their own curriculum whether
           or not they bought that. */
        can_author: body.canAuthor === true,
      })
      .select("id")
      .maybeSingle();

    if (error || !data) return fail(`Could not create: ${error?.message}`, 500);

    return NextResponse.json({ orgId: data.id });
  }

  /* --- The institute's own administrator ---------------------------------
     Without this an org exists and nobody at the institute can reach it: the
     console asks org_members for a row with role 'org_admin', and creating the
     org does not create one. The first one has to come from the vendor.

     Deliberately not restricted to super admins alone — an org admin can name
     a colleague, which is the difference between a customer who can run their
     own account and one who files a ticket every time somebody leaves. What
     they cannot do is name an admin of an organisation that is not theirs, and
     mayTouch is what stops that. */
  if (body.action === "assign_admin") {
    if (!body.orgId || !body.teacherEmail) {
      return fail("orgId and an email are required.", 400);
    }

    if (!mayTouch(body.orgId)) return fail("That is not your organisation.", 403);

    const { data: person } = await db
      .from("profiles")
      .select("id")
      .ilike("email", body.teacherEmail.trim())
      .maybeSingle();

    if (!person) {
      return fail(
        "Us email se koi account nahi mila. Unhe pehle sign up karna hoga.",
        404,
      );
    }

    const { error } = await db.from("org_members").upsert(
      { org_id: body.orgId, user_id: person.id as string, role: "org_admin" },
      { onConflict: "org_id,user_id" },
    );

    if (error) return fail(`Could not assign: ${error.message}`, 500);

    return NextResponse.json({ assigned: true });
  }

  /* --- A section -------------------------------------------------------- */
  if (body.action === "create_section") {
    if (!body.orgId || !body.name) return fail("orgId and name are required.", 400);
    if (!mayTouch(body.orgId)) return fail("That is not your organisation.", 403);

    const { data, error } = await db
      .from("sections")
      .insert({
        org_id: body.orgId,
        name: body.name,
        class_level: body.classLevel ?? null,
      })
      .select("id")
      .maybeSingle();

    if (error || !data) return fail(`Could not create: ${error?.message}`, 500);

    return NextResponse.json({ sectionId: data.id });
  }

  /* --- A teacher -------------------------------------------------------- */
  if (body.action === "assign_teacher") {
    if (!body.sectionId || !body.teacherEmail) {
      return fail("sectionId and teacherEmail are required.", 400);
    }

    /* The section is resolved and checked before the email is looked up.
       The other order is a working account-existence oracle: any org admin
       could post arbitrary addresses against a section id they do not own and
       read "no account with that email" off the response. */
    const { data: section } = await db
      .from("sections")
      .select("org_id")
      .eq("id", body.sectionId)
      .maybeSingle();

    if (!section) return fail("Section not found.", 404);
    if (!mayTouch(section.org_id as string)) return fail("Section not found.", 404);

    const { data: teacher } = await db
      .from("profiles")
      .select("id")
      .ilike("email", body.teacherEmail.trim())
      .maybeSingle();

    if (!teacher) {
      return fail(
        "Us email se koi account nahi mila. Teacher ko pehle sign up karna hoga.",
        404,
      );
    }

    /* Membership first, then the section. teaches_section checks both, and a
       teacher assigned to a section of an org they are not in would have a
       dashboard that raises on every load. */
    await db.from("org_members").upsert(
      { org_id: section.org_id, user_id: teacher.id as string, role: "teacher" },
      { onConflict: "org_id,user_id" },
    );

    await db
      .from("sections")
      .update({ teacher_id: teacher.id as string })
      .eq("id", body.sectionId);

    return NextResponse.json({ assigned: true });
  }

  /* --- The roster -------------------------------------------------------
     Existing accounts are enrolled now; the rest are recorded as expected and
     attach on sign-up. No account is created here — see the note at the top. */
  if (body.action === "import_roster") {
    if (!body.sectionId || !Array.isArray(body.emails)) {
      return fail("sectionId and emails are required.", 400);
    }

    const emails = body.emails
      .map((email) => String(email).trim().toLowerCase())
      .filter((email) => email.includes("@"))
      .slice(0, 500);

    if (emails.length === 0) return fail("Koi valid email nahi mili.", 400);

    const { data: section } = await db
      .from("sections")
      .select("org_id")
      .eq("id", body.sectionId)
      .maybeSingle();

    if (!section) return fail("Section not found.", 404);
    if (!mayTouch(section.org_id as string)) return fail("Section not found.", 404);

    /* One query for the whole batch against an indexed column. The previous
       shape — auth.admin.listUsers() — returned one page of fifty and quietly
       reported the other 450 students as "not signed up yet", which is exactly
       the failure a roster import must not have. */
    const { data: profiles } = await db
      .from("profiles")
      .select("id, email")
      .in("email", emails);

    const byEmail = new Map(
      (profiles ?? [])
        .filter((row) => row.email)
        .map((row) => [String(row.email).toLowerCase(), row.id as string]),
    );

    const matched = emails.filter((email) => byEmail.has(email));
    const pending = emails.filter((email) => !byEmail.has(email));

    /* Seats are checked, not enforced silently. An over-import should tell an
       admin they need to buy more rather than quietly dropping the last ten
       students off the end. */
    const { data: org } = await db
      .from("orgs")
      .select("seats")
      .eq("id", section.org_id)
      .maybeSingle();

    const { count: existing } = await db
      .from("org_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", section.org_id)
      .eq("role", "student");

    const wouldBe = (existing ?? 0) + matched.length;
    const seats = Number(org?.seats ?? 0);

    if (seats > 0 && wouldBe > seats) {
      return NextResponse.json(
        {
          error: `Ye import ${wouldBe} students le jaayega, par sirf ${seats} seats hain.`,
          seats,
          wouldBe,
        },
        { status: 409 },
      );
    }

    if (matched.length > 0) {
      await db.from("org_members").upsert(
        matched.map((email) => ({
          org_id: section.org_id,
          user_id: byEmail.get(email)!,
          role: "student",
        })),
        { onConflict: "org_id,user_id" },
      );

      await db.from("section_students").upsert(
        matched.map((email) => ({
          section_id: body.sectionId!,
          student_id: byEmail.get(email)!,
        })),
        { onConflict: "section_id,student_id" },
      );
    }

    return NextResponse.json({
      enrolled: matched.length,
      /* Returned rather than stored: there is no "invited student" table, and
         adding one would be a list of children's email addresses held for a
         purpose nobody consented to. The admin re-imports once they have
         signed up. */
      pending,
      note:
        pending.length > 0
          ? `${pending.length} students ne abhi sign up nahi kiya. Unke sign up karne ke baad ye list dobara import karein — accounts hum nahi bana sakte, kyunki har account ke liye parent ki anumati chahiye.`
          : undefined,
    });
  }

  return fail("Unknown action.", 400);
}
