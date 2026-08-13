/* Three accounts to click around with, and the organisation that ties them.
 *
 *   node scripts/seed-accounts.ts              create them, print the password
 *   node scripts/seed-accounts.ts --password X use a password you choose
 *   node scripts/seed-accounts.ts --remove     delete every seeded account
 *
 * ---------------------------------------------------------------------------
 * THESE ARE REAL ACCOUNTS IN A REAL DATABASE
 *
 * There is no separate development project here — this writes to whatever
 * NEXT_PUBLIC_SUPABASE_URL points at, which is the same project that will
 * serve the pilot. So:
 *
 *   - the password is random by default and printed exactly once. A seed
 *     script with a hardcoded password is a set of live doors with a key
 *     checked into git;
 *   - every account is tagged seeded: true in its metadata, which is what
 *     --remove keys off. Nothing is deleted by name matching;
 *   - --remove exists because "delete the test accounts before launch" is a
 *     line in a checklist that somebody will skip, and a one-word command is
 *     the only version of that instruction anyone actually runs.
 *
 * ---------------------------------------------------------------------------
 * WHY THREE, AND NOT THE FIVE THIS USED TO SEED
 *
 * There are three roles — super admin, teacher, student. See lib/roles.ts.
 * Two of the old five were not roles at all:
 *
 *   the principal   org_admin is a MEMBERSHIP, not an account role. The seeded
 *                   org still needs one, so the teacher below holds it. That
 *                   is one fewer password to keep track of and the org-admin
 *                   console is still reachable to click through. A real school
 *                   would separate them.
 *
 *   the parent      a parent has never had an account, and seeding a parent
 *                   LOGIN meant the seed exercised a path no real parent
 *                   takes. app/api/consent/grant/route.ts says it plainly: the
 *                   parent is a person holding a phone that received a link.
 *
 * ---------------------------------------------------------------------------
 * WHY A MINOR AND NOT AN ADULT STUDENT
 *
 * An adult student would be one line shorter and would skip the consent gate
 * entirely — which means the seeded account would exercise a path almost no
 * real user takes. The whole product is built for fourteen-year-olds whose
 * accounts are inert until a parent consents, so the seeded student is
 * fourteen and has consent rows behind them, evidenced by a phone number
 * exactly as production evidences them.
 *
 * Those consent rows are recorded with method 'school_authority' and
 * evidence { seeded: true } rather than pretending an OTP happened. A consent
 * record that lies about how it was obtained is worse than no record: it is
 * the one document that has to hold up if anybody ever asks. */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import type { StoredRole } from "../lib/roles.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

/* One place the client is built, so its type can be named. Writing the type
   out by hand means guessing at the Supabase generics, and they change. */
function connect(url: string, key: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Db = ReturnType<typeof connect>;

/* .test is reserved by RFC 2606 and can never be a real domain, so a seeded
   address cannot collide with a person's and cannot receive mail by accident. */
const DOMAIN = "paperpath.test";

const ORG_NAME = "Seed Public School";
const SECTION_NAME = "Class 8 — A";

/* Fourteen. Old enough to be the target user, young enough that the consent
   gate applies — which is the point. Computed from a fixed year rather than
   "today minus 14" so re-running the script does not silently drift a birthday
   across the eighteenth-birthday boundary one day in the future. */
const STUDENT_DOB = `${new Date().getFullYear() - 14}-06-15`;

type Seeded = {
  key: string;
  email: string;
  firstName: string;
  lastName: string;
  /* profiles.role — student | teacher, and nothing else; the column has a
     CHECK constraint saying so since supabase/roles.sql. Not the org
     membership, which is a separate thing: a teacher is a teacher OF an
     organisation, whereas this column is what kind of screen they land on.

     The super admin is not in here at all. It is an address in ADMIN_EMAILS,
     so the seeded admin is stored as a teacher and becomes a super admin the
     moment its address is added to the environment — which the script prints
     at the end, because it is the one step it cannot do itself. */
  role: StoredRole;
  what: string;
};

const PEOPLE: Seeded[] = [
  {
    key: "admin",
    email: `admin@${DOMAIN}`,
    firstName: "Platform",
    lastName: "Admin",
    role: "teacher",
    what: "super admin — the vendor. Needs its address in ADMIN_EMAILS; see the note at the end.",
  },
  {
    key: "teacher",
    email: `teacher@${DOMAIN}`,
    firstName: "Rahul",
    lastName: "Verma",
    role: "teacher",
    what: "teacher — org_admin of the seeded school, and teaches the seeded section.",
  },
  {
    key: "student",
    email: `student@${DOMAIN}`,
    firstName: "Aarav",
    lastName: "Sharma",
    role: "student",
    what: "student — fourteen, consented, enrolled in the seeded section.",
  },
];

/* The number the consent was given from. A real parent is reached here and
   nowhere else: no account, no password, just the phone that received the OTP
   and now receives the Sunday report. Same shape production stores. */
const PARENT_PHONE = "+911234500000";

/* Addresses this script used to create and no longer does.
 *
 * --remove walks PEOPLE, so shrinking that list from five to three quietly
 * stranded the two that were dropped: they stay in the project, seeded and
 * live, and the one command written to clean up before a pilot no longer knows
 * they exist. "Delete the test accounts" then becomes a manual job in the
 * Supabase dashboard, which is the version nobody does.
 *
 * So retirements are recorded rather than deleted from the code. Adding an
 * address here is how a seeded account stops being created but stays
 * removable. The metadata check in remove() still applies, so this cannot
 * delete a real person who happens to hold one of these addresses. */
const RETIRED = ["parent", "principal"].map((key) => `${key}@${DOMAIN}`);

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const contents = readFileSync(resolve(ROOT, file), "utf8");
      for (const line of contents.split(/\r?\n/)) {
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (!match) continue;
        const value = match[2].trim().replace(/^["']|["']$/g, "");
        if (!process.env[match[1]]) process.env[match[1]] = value;
      }
    } catch {
      /* Not there. The variables may come from the shell. */
    }
  }
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.",
    );
    process.exit(1);
  }

  const db = connect(url, key);

  console.log(`Project: ${url}\n`);

  if (process.argv.includes("--remove")) {
    await remove(db);
    return;
  }

  const passwordIndex = process.argv.indexOf("--password");

  /* Random unless asked otherwise. base64url of 12 bytes is 16 characters of
     mixed case and digits — long enough that a leaked seed account is not a
     way into the project, short enough to retype from a terminal. */
  const password =
    passwordIndex >= 0 && process.argv[passwordIndex + 1]
      ? process.argv[passwordIndex + 1]
      : randomBytes(12).toString("base64url");

  /* --- The people ------------------------------------------------------- */
  const ids = new Map<string, string>();

  for (const person of PEOPLE) {
    const id = await upsertUser(db, person, password);
    if (!id) return;

    ids.set(person.key, id);

    await db
      .from("profiles")
      .update({
        first_name: person.firstName,
        last_name: person.lastName,
        role: person.role,
        language: "hi-IN",
        /* Everyone but the student is an adult and needs no consent gate. The
           student's state is set further down, after their consent rows exist
           — so at no point is there an active minor with nothing behind it. */
        ...(person.key === "student"
          ? { dob: STUDENT_DOB }
          : { account_state: "active" }),
      })
      .eq("id", id);

    console.log(`  ${person.email.padEnd(28)} ${person.what}`);
  }

  /* --- The organisation -------------------------------------------------- */
  const orgId = await upsertOrg(db);
  if (!orgId) return;

  await db.from("org_members").upsert(
    [
      /* org_admin, so the school-side consoles are reachable, AND the
         teacher of the section. Two memberships would need two accounts; one
         account holding both is the smaller lie and keeps the seed to three
         passwords. A real school separates them. */
      { org_id: orgId, user_id: ids.get("teacher")!, role: "org_admin" },
      { org_id: orgId, user_id: ids.get("student")!, role: "student" },
    ],
    { onConflict: "org_id,user_id" },
  );

  const sectionId = await upsertSection(db, orgId, ids.get("teacher")!);

  if (sectionId) {
    await db
      .from("section_students")
      .upsert(
        { section_id: sectionId, student_id: ids.get("student")! },
        { onConflict: "section_id,student_id" },
      );
  }

  /* --- The consent behind the student ------------------------------------
     Written before the account is switched on, in that order, because an
     account_state of 'active' on a minor is precisely the state the whole
     consent design exists to make unreachable. */
  const { POLICY_VERSION, PURPOSES } = await import("../lib/consent/purposes.ts");

  /* INSERT, not upsert.
   *
   * This was `upsert(..., { onConflict: "student_id,purpose" })` and it had
   * never once worked: there is no unique constraint on those two columns, so
   * Postgres answered 42P10 every time and the seeder — which was not checking
   * the error — carried on and switched the account on anyway. The result was
   * a seeded student with no consent rows at all, permanently bounced to
   * /parent-consent, which looks exactly like the consent gate working.
   *
   * The constraint is missing on purpose, and adding one would be the wrong
   * repair. `consents` is an append-only history: both production writers
   * (consent/grant and consent/adult) INSERT, and every reader takes the
   * newest row per purpose. A unique key would make it impossible to withdraw
   * and re-grant, and would destroy the one record that has to hold up if
   * anybody ever asks what was agreed and when.
   *
   * So this matches production and clears its own rows first to stay
   * re-runnable, rather than bending the schema to suit a seed script. */
  const { error: clearError } = await db
    .from("consents")
    .delete()
    .eq("student_id", ids.get("student")!);

  if (clearError) {
    console.error(`\n  Could not clear old consents: ${clearError.message}`);
    return;
  }

  const { error: consentError } = await db.from("consents").insert(
    PURPOSES.map((purpose) => ({
      student_id: ids.get("student")!,
      /* No parent_id. A parent is not an account — the consent is evidenced by
         the phone it was given from, which is also where the Sunday report is
         sent. app/api/cron/parent-reports reads exactly this field. */
      parent_id: null,
      purpose: purpose.key,
      /* Including the optional ones. A seeded account with voice switched off
         is a seeded account that cannot be used to test voice, and finding
         that out takes ten minutes of thinking the microphone is broken. */
      granted: true,
      method: "school_authority",
      policy_version: POLICY_VERSION,
      evidence: { seeded: true, note: "scripts/seed-accounts.ts", phone: PARENT_PHONE },
    })),
  );

  /* Checked, and fatal. Switching the account on without the consent behind it
     is the one state this whole design exists to make unreachable, and doing
     it quietly is worse than failing. */
  if (consentError) {
    console.error(`\n  Could not record consent: ${consentError.message}`);
    console.error("  The student account has been left inactive on purpose.");
    return;
  }

  const { error: activateError } = await db
    .from("profiles")
    .update({ account_state: "active" })
    .eq("id", ids.get("student")!);

  if (activateError) {
    console.error(`\n  Could not activate the student: ${activateError.message}`);
    return;
  }

  /* --- What to do with all this ------------------------------------------ */
  console.log(`\n  Organisation: ${ORG_NAME} (${orgId})`);
  console.log(`  Section:      ${SECTION_NAME}${sectionId ? ` (${sectionId})` : ""}`);

  console.log(`  Parent phone: ${PARENT_PHONE} (consent + weekly report; no account)`);

  console.log(`\n  Password for all three:  ${password}`);
  console.log("  Printed once. It is random unless you passed --password.\n");

  console.log("  Where each one lands after signing in:");
  console.log(`    admin@${DOMAIN}`.padEnd(36) + "/admin      sees everything");
  console.log(`    teacher@${DOMAIN}`.padEnd(36) + "/teacher    classes only");
  console.log(`    student@${DOMAIN}`.padEnd(36) + "/dashboard  revision only");

  console.log("\n  One more step for the admin account — add this to .env.local:");
  console.log(`    ADMIN_EMAILS=admin@${DOMAIN}`);
  console.log(
    "  A super admin is an address in the environment, not a row in the\n" +
      "  database, so this cannot be done from here. Until it is set, that\n" +
      "  account signs in as an ordinary teacher.\n",
  );

  console.log("  Before the pilot:  node scripts/seed-accounts.ts --remove");
}

async function upsertUser(
  db: Db,
  person: Seeded,
  password: string,
): Promise<string | null> {
  const { data, error } = await db.auth.admin.createUser({
    email: person.email,
    password,
    /* No confirmation mail to a .test address that can never receive one. */
    email_confirm: true,
    user_metadata: {
      first_name: person.firstName,
      last_name: person.lastName,
      /* What --remove keys off. Deleting by address pattern would delete a
         real account the day somebody registers a lookalike. */
      seeded: true,
    },
  });

  if (!error && data.user) return data.user.id;

  /* Already there from a previous run: reset the password so the one printed
     now is the one that works, and carry on. */
  const existing = await findByEmail(db, person.email);

  if (!existing) {
    console.error(`Could not create ${person.email}: ${error?.message}`);
    return null;
  }

  await db.auth.admin.updateUserById(existing, {
    password,
    user_metadata: {
      first_name: person.firstName,
      last_name: person.lastName,
      seeded: true,
    },
  });

  return existing;
}

/* profiles.email is maintained by a trigger and indexed, which is how the
   roster import stopped paging through auth.admin.listUsers() fifty at a
   time. Same reason applies here. */
async function findByEmail(
  db: Db,
  email: string,
): Promise<string | null> {
  const { data } = await db
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
}

async function upsertOrg(db: Db): Promise<string | null> {
  const { data: existing } = await db
    .from("orgs")
    .select("id")
    .eq("name", ORG_NAME)
    .maybeSingle();

  const row = {
    name: ORG_NAME,
    kind: "school",
    seats: 40,
    /* A licence that is live today and not for ever. An org seeded with no
       expiry would hide every bug in the expiry path. */
    licence_starts_on: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    expires_at: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    licence_inr: 60000,
    billing_email: `principal@${DOMAIN}`,
    /* On, so the org-admin content console is worth opening. */
    can_author: true,
  };

  if (existing) {
    await db.from("orgs").update(row).eq("id", existing.id as string);
    return existing.id as string;
  }

  const { data, error } = await db.from("orgs").insert(row).select("id").maybeSingle();

  if (error || !data) {
    console.error(`\nCould not create the organisation: ${error?.message}`);
    console.error("Have supabase/schools.sql and supabase/tenancy.sql been run?");
    return null;
  }

  return data.id as string;
}

async function upsertSection(
  db: Db,
  orgId: string,
  teacherId: string,
): Promise<string | null> {
  const { data: existing } = await db
    .from("sections")
    .select("id")
    .eq("org_id", orgId)
    .eq("name", SECTION_NAME)
    .maybeSingle();

  if (existing) {
    await db
      .from("sections")
      .update({ teacher_id: teacherId })
      .eq("id", existing.id as string);
    return existing.id as string;
  }

  const { data } = await db
    .from("sections")
    .insert({ org_id: orgId, name: SECTION_NAME, class_level: 8, teacher_id: teacherId })
    .select("id")
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
}

async function remove(db: Db) {
  let removed = 0;

  /* The three this script creates, plus the ones it used to. See RETIRED. */
  const addresses = [...PEOPLE.map((person) => person.email), ...RETIRED];

  for (const email of addresses) {
    const id = await findByEmail(db, email);
    if (!id) continue;

    /* Checked rather than assumed. If somebody has repointed .env.local at a
       different project, or a real person has somehow ended up on one of these
       addresses, the metadata flag is what stops this deleting them. */
    const { data } = await db.auth.admin.getUserById(id);

    if (data.user?.user_metadata?.seeded !== true) {
      console.log(`  skipped ${email} — not marked as seeded`);
      continue;
    }

    /* auth.users cascades: profiles, consents, parent_links, org_members,
       section_students and every session all go with it. */
    await db.auth.admin.deleteUser(id);
    removed += 1;
    console.log(`  removed ${email}`);
  }

  const { data: org } = await db
    .from("orgs")
    .select("id")
    .eq("name", ORG_NAME)
    .maybeSingle();

  if (org) {
    await db.from("orgs").delete().eq("id", org.id as string);
    console.log(`  removed the organisation`);
  }

  console.log(`\n${removed} account${removed === 1 ? "" : "s"} removed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
