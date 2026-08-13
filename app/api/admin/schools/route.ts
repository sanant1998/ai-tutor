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
import { recordAudit } from "@/lib/audit";
import { requireContentAccess } from "@/lib/admin/access";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await requireContentAccess();
  if (!admin.ok) return fail(admin.message, admin.status);
  if (!isAdminConfigured()) return fail("Not configured.", 503);

  const db = createAdminClient();

  /* Who is on a licence, asked for one licence at a time.
     Not folded into the payload below: a five-hundred-seat school would put
     five hundred children's names into every load of this console, for the
     one admin in a hundred who is about to revoke one. */
  const seatsFor = new URL(request.url).searchParams.get("seatsFor");

  if (seatsFor) {
    const { data: licence } = await db
      .from("licences")
      .select("org_id")
      .eq("id", seatsFor)
      .maybeSingle();

    if (!licence) return fail("Licence not found.", 404);

    if (
      !admin.visibility.superAdmin &&
      !admin.visibility.adminOf.includes(licence.org_id as string)
    ) {
      return fail("Licence not found.", 404);
    }

    const { data: seats } = await db
      .from("licence_seats")
      .select("id, student_id, assigned_at, revoked_at")
      .eq("licence_id", seatsFor)
      .order("assigned_at");

    const { data: people } = await db
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", (seats ?? []).map((seat) => seat.student_id as string));

    const nameOf = new Map(
      (people ?? []).map((row) => [
        row.id as string,
        `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || (row.email as string) || "Student",
      ]),
    );

    return NextResponse.json({
      seats: (seats ?? []).map((seat) => ({
        id: seat.id as string,
        studentId: seat.student_id as string,
        name: nameOf.get(seat.student_id as string) ?? "Student",
        assignedAt: seat.assigned_at as string,
        revokedAt: seat.revoked_at as string | null,
      })),
    });
  }

  let orgQuery = db
    .from("orgs")
    .select("id, name, kind, seats, expires_at, created_at, licence_inr, licence_starts_on, can_author, board")
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
    .select("id, org_id, name, class_level, teacher_id, academic_year_id");

  /* The licence and its seats, which are a different question from
     org_seat_usage above: that one counts memberships, this one counts the
     seats a school is actually being billed for. The two disagreeing is the
     normal state of a school mid-term — children enrolled but not yet seated —
     and the console has to be able to show both or the seat allocation screen
     has nothing to work from. */
  const { data: licences } = await db
    .from("licence_seat_usage")
    .select("licence_id, org_id, plan_code, seats_purchased, seats_used, starts_on, expires_on, status");

  const { data: years } = await db
    .from("academic_years")
    .select("id, org_id, label, is_current")
    .order("starts_on", { ascending: false });

  /* Offered to the form. A plan is a row, not a string somebody types, and a
     console that lets you type one is a console that creates licences against
     plans which do not exist. */
  const { data: plans } = await db
    .from("licence_plans")
    .select("code, name, price_per_seat_inr, ai_credits_per_day, can_author")
    .eq("is_active", true)
    .order("price_per_seat_inr");

  const { data: boards } = await db
    .from("boards")
    .select("code, name")
    .eq("is_active", true);

  /* The subjects a teacher can be assigned to.
     Subjects are not created here and cannot be: one comes into existence when
     a content pack is published, from the pack's own header. This console only
     connects a teacher to one that already exists — which is the whole reason
     teacher_assignments has a subject_ref rather than a free-text field. */
  const { data: subjects } = await db
    .from("subjects")
    .select("id, name, board, class_level")
    .order("class_level")
    .order("name");

  /* What each plan currently unlocks. No rows for a plan means everything —
     which is why showing this matters: "no restriction" and "not configured"
     look identical from the outside and are the same thing commercially. */
  const { data: planAccess } = await db
    .from("licence_plan_access")
    .select("id, plan_code, board, class_level, subject_id");

  /* What the last few imports did.
     import_jobs was added with the argument that a response nobody kept is no
     answer at all — "which twelve did not go in" has to survive the tab being
     closed. It has been written on every import since and displayed nowhere,
     which left the table doing exactly what the note said it was there to
     prevent. */
  const { data: imports } = await db
    .from("import_jobs")
    .select("id, org_id, kind, source_name, total_rows, success_rows, failed_rows, errors, status, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  /* Raised at onboarding, and until now visible to nobody — not the vendor,
     not the school that has to pay it. */
  const { data: invoices } = await db
    .from("org_invoices")
    .select("id, org_id, number, total_inr, status, issued_on, due_on, po_number")
    .order("issued_on", { ascending: false })
    .limit(50);

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
      board: (org.board as string | null) ?? null,
      /* A school with no current year cannot have a section created against
         one, and promotion at the end of the year has nothing to promote INTO.
         Surfaced rather than inferred, because the fix is one click and the
         symptom otherwise appears twelve months later. */
      currentYear:
        (years ?? []).find((year) => year.org_id === org.id && year.is_current)?.label ?? null,
      /* Ids as well as the label, because promotion has to be told which year
         the children are moving INTO and a console that only knows the name
         cannot say. */
      years: (years ?? [])
        .filter((year) => year.org_id === org.id)
        .map((year) => ({
          id: year.id as string,
          label: year.label as string,
          isCurrent: year.is_current === true,
        })),
      imports: (imports ?? [])
        .filter((job) => job.org_id === org.id)
        .map((job) => ({
          id: job.id as string,
          kind: job.kind as string,
          at: job.created_at as string,
          total: Number(job.total_rows ?? 0),
          enrolled: Number(job.success_rows ?? 0),
          failed: Number(job.failed_rows ?? 0),
          /* Row numbers and reasons. No addresses — the route that writes
             these deliberately stores neither. */
          errors: (job.errors ?? []) as { row: number; reason: string }[],
        })),
      invoices: (invoices ?? [])
        .filter((invoice) => invoice.org_id === org.id)
        .map((invoice) => ({
          id: invoice.id as string,
          number: invoice.number as string,
          totalInr: Number(invoice.total_inr ?? 0),
          status: invoice.status as string,
          issuedOn: invoice.issued_on as string,
          dueOn: invoice.due_on as string | null,
          poNumber: invoice.po_number as string | null,
          /* Overdue is computed rather than stored: the row says 'pending'
             until somebody marks it paid, and a due date in the past is the
             only thing that makes that urgent. */
          overdue:
            invoice.status === "pending" &&
            Boolean(invoice.due_on) &&
            new Date(invoice.due_on as string) < new Date(),
        })),
      licences: (licences ?? [])
        .filter((licence) => licence.org_id === org.id)
        .map((licence) => ({
          id: licence.licence_id as string,
          plan: licence.plan_code as string,
          seatsPurchased: Number(licence.seats_purchased ?? 0),
          seatsUsed: Number(licence.seats_used ?? 0),
          startsOn: licence.starts_on as string,
          expiresOn: licence.expires_on as string,
          status: licence.status as string,
        })),
      sections: (sections ?? [])
        .filter((section) => section.org_id === org.id)
        .map((section) => ({
          id: section.id as string,
          name: section.name as string,
          classLevel: section.class_level as number | null,
          hasTeacher: Boolean(section.teacher_id),
          /* A section created before schoolops.sql ran, or by a console that
             did not attach one. It works — and it cannot be promoted. */
          hasYear: Boolean(section.academic_year_id),
        })),
    })),
    plans: (plans ?? []).map((plan) => ({
      code: plan.code as string,
      name: plan.name as string,
      pricePerSeatInr: Number(plan.price_per_seat_inr ?? 0),
      aiCreditsPerDay: Number(plan.ai_credits_per_day ?? 0),
      canAuthor: plan.can_author === true,
    })),
    boards: (boards ?? []).map((board) => ({
      code: board.code as string,
      name: board.name as string,
    })),
    planAccess: (planAccess ?? []).map((row) => ({
      id: row.id as string,
      plan: row.plan_code as string,
      board: row.board as string | null,
      classLevel: row.class_level as number | null,
      subjectId: row.subject_id as string | null,
    })),
    subjects: (subjects ?? []).map((subject) => ({
      ref: subject.id as string,
      label: `Class ${subject.class_level} · ${subject.name} (${String(subject.board).toUpperCase()})`,
      classLevel: subject.class_level as number,
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
      | "assign_admin"
      | "assign_seats"
      | "promote"
      | "revoke_seat"
      | "create_year"
      | "plan_access";
    orgId?: string;
    name?: string;
    kind?: string;
    seats?: number;
    expiresOn?: string;
    licenceStartsOn?: string;
    billingEmail?: string;
    billingContact?: string;
    sectionId?: string;
    classLevel?: number;
    emails?: string[];
    teacherEmail?: string;
    /* The licence, as sold. canAuthor and licenceInr are gone from this list:
       authoring now follows the plan, and the price follows the plan and the
       seat count — two fields that could disagree with the licence row are two
       fields that eventually will. */
    planCode?: string;
    pricePerSeatInr?: number;
    poNumber?: string;
    raiseInvoice?: boolean;
    board?: string;
    yearLabel?: string;
    licenceId?: string;
    studentIds?: string[];
    seatId?: string;
    label?: string;
    startsOn?: string;
    endsOn?: string;
    makeCurrent?: boolean;
    planCodeForAccess?: string;
    accessBoard?: string | null;
    accessClassLevel?: number | null;
    accessSubjectId?: string | null;
    removeAccessId?: string;
    subjectRef?: string;
    fromSectionId?: string;
    toSectionId?: string;
    academicYearId?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const db = createAdminClient();

  /* --- A new org --------------------------------------------------------
     One call to onboard_school(), which creates the org, its licence and its
     first academic year in a single transaction.

     It used to be this route inserting a row into orgs, and the rest — the
     licence, the year, the seats — was left to whoever remembered. What that
     produced was a school that exists, has no licence, and looks identical on
     every screen to one whose paperwork simply has not been entered yet.
     Nobody finds it until the students cannot open anything.

     The validation lives in the function rather than here for the same
     reason: a second console, a seed script or a support engineer in the SQL
     editor would each have to repeat it, and the one that forgot would be the
     one that created the school with no expiry date. */
  if (body.action === "create_org") {
    /* The vendor only. An organisation carries a seat count and an expiry that
       came from a signed contract, so a customer creating one would be writing
       their own licence. */
    if (!admin.visibility.superAdmin) {
      return fail("Only the platform team can create a new organisation.", 403);
    }

    if (!body.name) return fail("name is required.", 400);

    /* Answered here as well as in the function, because these three produce
       the message the person filling in the form has to act on, and a raised
       exception from Postgres arrives as prose about a constraint. */
    if (!body.expiresOn) {
      return fail(
        "The licence needs an expiry date. Without one the school gets permanent free access.",
        400,
      );
    }

    if (!body.planCode) return fail("A plan must be chosen.", 400);
    if (!Number(body.seats)) return fail("The number of seats sold must be entered.", 400);

    const { data, error } = await db.rpc("onboard_school", {
      p_name: body.name,
      p_plan_code: body.planCode,
      p_seats: Number(body.seats),
      p_starts_on: body.licenceStartsOn ?? new Date().toISOString().slice(0, 10),
      p_expires_on: body.expiresOn,
      p_kind: body.kind === "coaching" ? "coaching" : "school",
      p_board: body.board ?? null,
      p_price_per_seat_inr: body.pricePerSeatInr ?? null,
      p_po_number: body.poNumber ?? null,
      p_billing_email: body.billingEmail ?? null,
      p_billing_contact: body.billingContact ?? null,
      p_year_label: body.yearLabel ?? null,
      p_actor: admin.userId,
      p_raise_invoice: body.raiseInvoice === true,
    });

    if (error) {
      /* Postgres messages here are written to be read — "a licence needs an
         expiry date", "no such plan: x" — so they are passed through rather
         than replaced with a generic failure that sends someone to the logs. */
      return fail(`The school could not be onboarded: ${error.message}`, 400);
    }

    const result = (data ?? {}) as {
      org_id?: string;
      licence_id?: string;
      academic_year_id?: string;
      invoice_number?: string;
    };

    return NextResponse.json({
      orgId: result.org_id,
      licenceId: result.licence_id,
      academicYearId: result.academic_year_id,
      invoiceNumber: result.invoice_number ?? null,
    });
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
        "No account found for that email. They need to sign up first.",
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

    /* The current year, attached without asking. A section with no year is
       one that cannot be promoted at the end of it — 8-A in 2026-27 and 8-A in
       2027-28 stay the same row, and last year's results reattach to this
       year's children. The console does not ask because there is exactly one
       right answer and academic_years already knows it. */
    const { data: year } = await db
      .from("academic_years")
      .select("id")
      .eq("org_id", body.orgId)
      .eq("is_current", true)
      .maybeSingle();

    const { data, error } = await db
      .from("sections")
      .insert({
        org_id: body.orgId,
        name: body.name,
        class_level: body.classLevel ?? null,
        academic_year_id: year?.id ?? null,
      })
      .select("id")
      .maybeSingle();

    if (error || !data) return fail(`Could not create: ${error?.message}`, 500);

    await recordAudit(
      {
        orgId: body.orgId,
        actorId: admin.userId,
        actorRole: admin.visibility.superAdmin ? "super_admin" : "org_admin",
        action: "section.create",
        entityType: "section",
        entityId: data.id as string,
        after: { name: body.name, classLevel: body.classLevel ?? null },
      },
      request,
    );

    return NextResponse.json({ sectionId: data.id, academicYearId: year?.id ?? null });
  }

  /* --- A seat back ------------------------------------------------------
     Assigning existed from the day licence_seats did; giving one back did
     not. So a student who left in October held their seat until the licence
     expired, the count never came down, and the next import was refused with
     "seats full" against a school that had spare ones.

     Revoked, not deleted. "This child had access from June to November" is
     the question a disputed bill turns into, and a deleted row cannot answer
     it — which is the reason the column exists at all. */
  if (body.action === "revoke_seat") {
    if (!body.seatId) return fail("seatId is required.", 400);

    const { data: seat } = await db
      .from("licence_seats")
      .select("id, org_id, student_id, revoked_at")
      .eq("id", body.seatId)
      .maybeSingle();

    if (!seat) return fail("Seat not found.", 404);
    if (!mayTouch(seat.org_id as string)) return fail("Seat not found.", 404);

    if (seat.revoked_at) {
      return NextResponse.json({ revoked: true, note: "That seat has already been taken back." });
    }

    const { error } = await db
      .from("licence_seats")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", body.seatId);

    if (error) return fail(`The seat could not be taken back: ${error.message}`, 400);

    await recordAudit(
      {
        orgId: seat.org_id as string,
        actorId: admin.userId,
        actorRole: admin.visibility.superAdmin ? "super_admin" : "org_admin",
        action: "licence.revoke_seat",
        entityType: "user",
        entityId: seat.student_id as string,
        after: { seatId: body.seatId },
      },
      request,
    );

    /* Said plainly, because it is the point of the operation and it is not
       reversible from the student's side: they lose access to everything the
       licence covered, the moment this returns. */
    return NextResponse.json({
      revoked: true,
      note: "Seat taken back. That student's access has stopped.",
    });
  }

  /* --- What a plan unlocks -----------------------------------------------
     licence_plan_access has existed since licensing.sql and had no way in but
     the SQL editor, so every plan sold the whole catalogue: the table's own
     rule is that no rows means no restriction, and no rows is what every plan
     had. A school on the cheaper plan was getting the expensive one.

     Vendor only. This is the price list, not a school's own settings — an org
     admin editing what their plan covers is an org admin writing their own
     licence. */
  if (body.action === "plan_access") {
    if (!admin.visibility.superAdmin) {
      return fail("Plan ki content access sirf platform team badal sakti hai.", 403);
    }

    if (body.removeAccessId) {
      const { error } = await db
        .from("licence_plan_access")
        .delete()
        .eq("id", body.removeAccessId);

      if (error) return fail(`Hata nahi paaye: ${error.message}`, 400);

      return NextResponse.json({ removed: true });
    }

    if (!body.planCodeForAccess) return fail("Plan chunna zaroori hai.", 400);

    /* All three null is the row that says "everything", which is what an empty
       list already means — so it would add a row that changes nothing while
       looking like a restriction. */
    if (!body.accessBoard && !body.accessClassLevel && !body.accessSubjectId) {
      return fail(
        "Kam se kam ek cheez chunein — board, class ya subject. Teeno khaali ka matlab wahi hai jo koi row na hone ka.",
        400,
      );
    }

    const { error } = await db.from("licence_plan_access").insert({
      plan_code: body.planCodeForAccess,
      board: body.accessBoard || null,
      class_level: body.accessClassLevel ?? null,
      subject_id: body.accessSubjectId || null,
    });

    if (error) {
      /* The unique index fires when the same combination is added twice. */
      return fail(`Add nahi hua: ${error.message}`, 400);
    }

    await recordAudit(
      {
        orgId: null,
        actorId: admin.userId,
        actorRole: "super_admin",
        action: "plan.access_add",
        entityType: "licence_plan",
        entityId: body.planCodeForAccess,
        after: {
          board: body.accessBoard ?? null,
          classLevel: body.accessClassLevel ?? null,
          subjectId: body.accessSubjectId ?? null,
        },
      },
      request,
    );

    return NextResponse.json({ added: true });
  }

  /* --- Next year --------------------------------------------------------
     onboard_school() creates the first academic year and nothing created the
     second. That is a bug with a twelve-month fuse: promotion needs a year to
     promote INTO, so the whole year-end flow works exactly once and then has
     nowhere to go, at the moment of the year nobody is watching a console. */
  if (body.action === "create_year") {
    if (!body.orgId || !body.label || !body.startsOn || !body.endsOn) {
      return fail("Org, label, aur dono dates chahiye.", 400);
    }

    if (!mayTouch(body.orgId)) return fail("That is not your organisation.", 403);

    const { data: year, error } = await db
      .from("academic_years")
      .insert({
        org_id: body.orgId,
        label: body.label.trim(),
        starts_on: body.startsOn,
        ends_on: body.endsOn,
        /* Inserted as NOT current even when it is meant to be.
           academic_years has a partial unique index allowing one current year
           per org, so inserting a second current one fails outright. Unsetting
           the old one first would leave the school with no current year if
           this insert then failed on the label or the date check — and a
           school with no current year cannot have sections created against
           one. Insert first, switch after: the failure mode of the safe order
           is a year that exists and is not current, which the console shows
           and one click fixes. */
        is_current: false,
      })
      .select("id")
      .maybeSingle();

    if (error || !year) {
      return fail(`Year nahi bana: ${error?.message}`, 400);
    }

    if (body.makeCurrent) {
      await db
        .from("academic_years")
        .update({ is_current: false })
        .eq("org_id", body.orgId)
        .eq("is_current", true);

      await db.from("academic_years").update({ is_current: true }).eq("id", year.id);
    }

    await recordAudit(
      {
        orgId: body.orgId,
        actorId: admin.userId,
        actorRole: admin.visibility.superAdmin ? "super_admin" : "org_admin",
        action: "year.create",
        entityType: "academic_year",
        entityId: year.id as string,
        after: { label: body.label, current: body.makeCurrent === true },
      },
      request,
    );

    return NextResponse.json({ id: year.id });
  }

  /* --- Year end ----------------------------------------------------------
     Promotion, which until now existed only as promote_section() in the
     database and could be run by nobody without the SQL editor. It moves the
     roster, writes the history row that makes last year's results legible
     afterwards, and follows the student record across — all in one
     transaction, because a half-promoted school is one where some children
     are in Class 9 and some are still in Class 8 and no screen says which. */
  if (body.action === "promote") {
    if (!body.fromSectionId || !body.toSectionId || !body.academicYearId) {
      return fail("From which section, into which, and for which year — all three are needed.", 400);
    }

    const { data: from } = await db
      .from("sections")
      .select("org_id, name")
      .eq("id", body.fromSectionId)
      .maybeSingle();

    if (!from) return fail("Section not found.", 404);
    if (!mayTouch(from.org_id as string)) return fail("Section not found.", 404);

    const { data: moved, error } = await db.rpc("promote_section", {
      p_from_section: body.fromSectionId,
      p_to_section: body.toSectionId,
      p_academic_year: body.academicYearId,
    });

    if (error) {
      /* The function raises in words: not your organisation, sections belong
         to different organisations, that academic year belongs to another
         organisation. All three are worth reading as written. */
      return fail(`The promotion failed: ${error.message}`, 400);
    }

    await recordAudit(
      {
        orgId: from.org_id as string,
        actorId: admin.userId,
        actorRole: admin.visibility.superAdmin ? "super_admin" : "org_admin",
        action: "section.promote",
        entityType: "section",
        entityId: body.fromSectionId,
        after: { to: body.toSectionId, year: body.academicYearId, moved },
      },
      request,
    );

    return NextResponse.json({ moved: Number(moved ?? 0) });
  }

  /* --- Seats -------------------------------------------------------------
     Which children are actually on the licence. Until this existed the seat
     count was a number on the org and nothing recorded who was using it, so
     "the school says it has forty spare, why is this child locked out" had no
     answer anywhere in the product.

     The rules — a member of this school, this school's licence, within the
     seat count — are the trigger on licence_seats and are not repeated here.
     assign_seats attempts each child separately and reports the refusals, so
     one transferred-out student does not make a class of forty unallottable. */
  if (body.action === "assign_seats") {
    if (!body.licenceId) return fail("licenceId is required.", 400);

    const { data: licence } = await db
      .from("licences")
      .select("org_id")
      .eq("id", body.licenceId)
      .maybeSingle();

    if (!licence) return fail("Licence not found.", 404);
    if (!mayTouch(licence.org_id as string)) return fail("Licence not found.", 404);

    let students = body.studentIds;

    /* No list means "everyone who is enrolled and not yet seated", which is
       what an admin wants after importing a class and is otherwise forty
       checkboxes. Naming ids explicitly stays possible for the case where it
       matters — a licence bought for one grade, say. */
    if (!Array.isArray(students)) {
      const { data: members } = await db
        .from("org_members")
        .select("user_id")
        .eq("org_id", licence.org_id)
        .eq("role", "student");

      const { data: seated } = await db
        .from("licence_seats")
        .select("student_id")
        .eq("licence_id", body.licenceId)
        .is("revoked_at", null);

      const taken = new Set((seated ?? []).map((row) => row.student_id as string));
      students = (members ?? [])
        .map((row) => row.user_id as string)
        .filter((id) => !taken.has(id));
    }

    if (students.length === 0) {
      return NextResponse.json({ assigned: 0, skipped: [], note: "Every student already has a seat." });
    }

    const { data, error } = await db.rpc("assign_seats", {
      p_licence: body.licenceId,
      p_students: students,
    });

    if (error) return fail(`Seats could not be allotted: ${error.message}`, 400);

    const result = (data ?? {}) as { assigned?: number; skipped?: unknown[] };

    await recordAudit(
      {
        orgId: licence.org_id as string,
        actorId: admin.userId,
        actorRole: admin.visibility.superAdmin ? "super_admin" : "org_admin",
        action: "licence.assign_seats",
        entityType: "licence",
        entityId: body.licenceId,
        after: { assigned: result.assigned ?? 0, skipped: result.skipped ?? [] },
      },
      request,
    );

    return NextResponse.json({
      assigned: result.assigned ?? 0,
      skipped: result.skipped ?? [],
    });
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
        "No account found for that email. The teacher needs to sign up first.",
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

    /* The subject, if one was named.
       sections.teacher_id is the CLASS teacher — the one who takes attendance
       and talks to the parent, a real and separate job in an Indian school.
       Subject teaching is teacher_assignments, and it is what teaches_section
       now derives scope from. Without a row here the Maths teacher of 8-A can
       only be given that class by being made an admin of the whole school. */
    let assignmentId: string | null = null;

    if (body.subjectRef) {
      const { data: year } = await db
        .from("academic_years")
        .select("id")
        .eq("org_id", section.org_id)
        .eq("is_current", true)
        .maybeSingle();

      const { data: assignment, error: assignmentError } = await db
        .from("teacher_assignments")
        .upsert(
          {
            org_id: section.org_id,
            teacher_id: teacher.id as string,
            section_id: body.sectionId,
            subject_ref: body.subjectRef,
            academic_year_id: year?.id ?? null,
          },
          { onConflict: "teacher_id,section_id,subject_ref,academic_year_id" },
        )
        .select("id")
        .maybeSingle();

      if (assignmentError) {
        return fail(`The subject could not be assigned: ${assignmentError.message}`, 400);
      }

      assignmentId = (assignment?.id as string) ?? null;
    }

    await recordAudit(
      {
        orgId: section.org_id as string,
        actorId: admin.userId,
        actorRole: admin.visibility.superAdmin ? "super_admin" : "org_admin",
        action: "teacher.assign",
        entityType: "section",
        entityId: body.sectionId,
        after: { teacher: teacher.id, subjectRef: body.subjectRef ?? null },
      },
      request,
    );

    return NextResponse.json({ assigned: true, assignmentId });
  }

  /* --- The roster -------------------------------------------------------
     Existing accounts are enrolled now; the rest are recorded as expected and
     attach on sign-up. No account is created here — see the note at the top. */
  if (body.action === "import_roster") {
    if (!body.sectionId || !Array.isArray(body.emails)) {
      return fail("sectionId and emails are required.", 400);
    }

    /* One row per line: email, admission number, roll number.
       The last two are optional and everything before this accepted a bare
       list of addresses, which still works — but a register with no admission
       numbers is the gap a school finds on day one, when the teacher's class
       list shows forty children and no way to match them to the school's own
       records. Asking for them at import is the only moment somebody has the
       spreadsheet open. */
    const parsed = body.emails.map((row) => {
      const [email, admission, roll] = String(row)
        .split(/[,;\t]/)
        .map((cell) => cell.trim());

      return {
        email: (email ?? "").toLowerCase(),
        admissionNumber: admission || null,
        rollNumber: roll || null,
      };
    });

    const submitted = parsed.map((row) => row.email);

    /* Which ROWS were malformed, by position, with no value carried across.
       The admin has the spreadsheet open: "row 14" is the whole fix, and the
       alternative — storing the typo'd address so the console can show it —
       puts a child's email in a table for the convenience of a message. */
    const malformed = submitted
      .map((email, index) => ({ row: index + 1, email }))
      .filter(({ email }) => !email.includes("@"))
      .map(({ row }) => ({ row, reason: "not an email address" }));

    const emails = submitted.filter((email) => email.includes("@")).slice(0, 500);

    if (emails.length === 0) return fail("No valid email addresses found.", 400);

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
          error: `This import would take the school to ${wouldBe} students, but there are only ${seats} seats.`,
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

      /* The school's own record of the child, for the rows that carried one.
         Skipped where no admission number was given: the column is NOT NULL
         because a record without one is not a record, and inventing a
         placeholder would put a fake identifier into the register a school
         reconciles against its fee software.

         onConflict on (org_id, student_id) so a re-import corrects a roll
         number rather than failing on the row that is already there — which is
         what a re-import IS: the office fixing the twelve that were wrong. */
      const records = parsed
        .filter((row) => row.admissionNumber && byEmail.has(row.email))
        .map((row) => ({
          org_id: section.org_id,
          student_id: byEmail.get(row.email)!,
          admission_number: row.admissionNumber!,
          roll_number: row.rollNumber,
          section_id: body.sectionId!,
        }));

      if (records.length > 0) {
        const { error: recordError } = await db
          .from("student_records")
          .upsert(records, { onConflict: "org_id,student_id" });

        if (recordError) {
          /* The unique index on (org_id, admission_number) fires here when two
             children in the same school were given the same number — a real
             mistake in the source spreadsheet, and one worth stopping for
             rather than silently keeping whichever row went in last. */
          return fail(
            `The students were enrolled, but their admission numbers were not saved: ${recordError.message}`,
            409,
          );
        }
      }
    }

    /* The job, recorded. Not the addresses.
       Until now an import of five hundred left nothing behind but the
       response: close the tab and "which twelve did not go in" has no answer
       anywhere. import_jobs holds the counts and the failed ROW NUMBERS, which
       is what the person with the spreadsheet needs — and deliberately not the
       pending list, for the reason immediately below. */
    const { data: job } = await db
      .from("import_jobs")
      .insert({
        org_id: section.org_id,
        uploaded_by: admin.userId,
        kind: "students",
        source_name: body.name ?? null,
        total_rows: submitted.length,
        success_rows: matched.length,
        failed_rows: malformed.length + pending.length,
        errors: malformed,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();

    await recordAudit(
      {
        orgId: section.org_id as string,
        actorId: admin.userId,
        actorRole: admin.visibility.superAdmin ? "super_admin" : "org_admin",
        action: "roster.import",
        entityType: "section",
        entityId: body.sectionId,
        after: {
          total: submitted.length,
          enrolled: matched.length,
          pending: pending.length,
          malformed: malformed.length,
        },
      },
      request,
    );

    const withNumbers = parsed.filter(
      (row) => row.admissionNumber && byEmail.has(row.email),
    ).length;

    return NextResponse.json({
      importJobId: job?.id ?? null,
      enrolled: matched.length,
      /* Counted separately from `enrolled`, because "40 enrolled" reads as
         done and "40 enrolled, 0 with admission numbers" reads as a register
         the teacher cannot use. */
      withAdmissionNumbers: withNumbers,
      malformed,
      /* Returned rather than stored: there is no "invited student" table, and
         adding one would be a list of children's email addresses held for a
         purpose nobody consented to. The admin re-imports once they have
         signed up. */
      pending,
      note:
        pending.length > 0
          ? `${pending.length} students have not signed up yet. Import this list again once they have — we cannot create the accounts ourselves, because every one of them needs a parent's permission.`
          : undefined,
    });
  }

  return fail("Unknown action.", 400);
}
