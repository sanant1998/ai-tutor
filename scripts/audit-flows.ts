/* Does every journey actually connect end to end?
 *
 *   npm run audit:flows
 *
 * ---------------------------------------------------------------------------
 * THE FAILURE THIS CATCHES
 *
 * Not a broken route — the smoke tests cover those. This catches a route that
 * works perfectly and that nothing links to, or a step that hands off to a
 * screen which cannot continue the journey.
 *
 * Those are invisible in every other check. Typecheck passes, the build
 * passes, the page renders, the API answers — and a student finishes a session
 * and finds a dead end, or a feature ships that only its author knows the URL
 * for. Four of those were found by hand in this project (practice unreachable,
 * assignments never displayed, the spaced-repetition schedule computed and
 * never read, the student's screen never learning their parent had consented),
 * which is three too many to keep finding by hand.
 *
 * So: the journeys are written down as steps, each step says what must link to
 * what, and this greps for it. Crude, and it has already paid for itself.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT CANNOT SEE
 *
 * Whether the link is reachable in practice — behind a role check, inside a
 * collapsed panel, three scrolls down. A grep proves the wiring exists, not
 * that a fourteen-year-old finds it. Walking the app is still the real test. */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

type Step = {
  step: string;
  /* A file that must exist. */
  file?: string;
  /* Something that must appear somewhere in app/, lib/ or components/. */
  wires?: string;
  /* ...and specifically in this file, when the location matters. */
  inFile?: string;
  why: string;
};

type Flow = { name: string; steps: Step[] };

const FLOWS: Flow[] = [
  {
    name: "New student, under 18",
    steps: [
      {
        step: "sign up lands on the age gate, not onboarding",
        inFile: "components/auth/SignupForm.tsx",
        wires: "/parent-consent",
        why: "a teacher sent straight into a student's five-step revision setup was the old behaviour",
      },
      {
        step: "OAuth callback lands there too",
        inFile: "app/auth/callback/route.ts",
        wires: "/parent-consent",
        why: "Google sign-in must not bypass the gate",
      },
      {
        step: "the age gate exists and offers all three roles",
        file: "components/consent/AgeGate.tsx",
        why: "an adult with no way past the consent screen was stuck for ever",
      },
      {
        step: "a minor reaches the parental screen",
        inFile: "components/consent/AgeGate.tsx",
        wires: "RequestConsent",
        why: "the under-18 branch has to hand off",
      },
      {
        step: "the student's screen polls while the parent decides",
        inFile: "components/consent/RequestConsent.tsx",
        wires: "setInterval",
        why: "the grant happens on the parent's phone; without polling the student waits for ever",
      },
      {
        step: "the parent's own screen exists",
        file: "components/consent/ConsentForm.tsx",
        why: "the link in the WhatsApp message has to open something",
      },
      {
        step: "a consented student is routed by onboarding state",
        inFile: "app/parent-consent/page.tsx",
        wires: "/onboarding",
        why: "a brand-new student sent to the dashboard lands on an empty plan",
      },
      {
        step: "the dashboard's onboarding hint is clickable",
        inFile: "components/app/TodayView.tsx",
        wires: 'href="/onboarding"',
        why: "it was a sentence, not a link — a dead end",
      },
    ],
  },

  {
    name: "Learning",
    steps: [
      { step: "the tutor index is in the nav", inFile: "lib/nav.ts", wires: "/tutor", why: "otherwise nobody finds it" },
      {
        step: "a topic card links into a session",
        inFile: "app/(dashboard)/tutor/page.tsx",
        wires: "/tutor/${card.id}",
        why: "the list has to open something",
      },
      {
        step: "a finished concept hands off to practice",
        inFile: "components/app/TutorView.tsx",
        wires: "/practice/",
        why: "practice existed with nothing linking to it; a session used to end in a dead input",
      },
      {
        step: "a taught topic can be practised again from the index",
        inFile: "app/(dashboard)/tutor/page.tsx",
        wires: "/practice/${card.id}",
        why: "drilling a topic you were taught last week had no entry point",
      },
      {
        step: "spaced repetition is surfaced",
        inFile: "app/(dashboard)/tutor/page.tsx",
        wires: "dueTopics",
        why: "SM-2 computed next_review_at and nothing ever read it",
      },
      {
        step: "teacher assignments are shown to the student",
        inFile: "app/(dashboard)/tutor/page.tsx",
        wires: "assignments",
        why: "a teacher could set work no student would ever see",
      },
      {
        step: "the fix sheet is reachable",
        inFile: "app/(dashboard)/tutor/page.tsx",
        wires: "/fix-sheet/tutor",
        why: "built from error_events and linked from nowhere",
      },
      {
        step: "a tutor message can be read aloud",
        inFile: "components/app/TutorView.tsx",
        wires: "SpeakButton",
        why: "speech was built and mounted nowhere would be the same as not building it",
      },
      {
        step: "the speak route addresses a stored turn, not text from the browser",
        inFile: "components/app/SpeakButton.tsx",
        wires: "seq",
        why: "sending text would make it an open text-to-speech proxy on our bill",
      },
      {
        step: "the paywall shows instead of an error",
        inFile: "components/app/TutorView.tsx",
        wires: "Paywall",
        why: "a 402 rendered as red text is the worst possible moment to look broken",
      },
    ],
  },

  {
    name: "Parent",
    steps: [
      /* A parent has no account and no screen. Every one of these three steps
         used to check that they did — the nav entry, the link request, the
         student's confirmation — and all three were deleted with the parent
         role. What reaches a parent now is a consent OTP and the Sunday
         report, both to the phone on the consent row, and both are checked
         below. */
      {
        step: "consent reaches a parent without an account",
        inFile: "app/api/consent/request/route.ts",
        wires: "sendConsentCode",
        why: "a parent who has to register first never consents, and the child stays locked out",
      },
      {
        step: "the student can grant from the link alone",
        inFile: "app/api/consent/grant/route.ts",
        wires: "verifyChallenge",
        why: "the OTP is the authorisation; there is no session behind it",
      },
      {
        step: "the weekly report has a sender",
        file: "app/api/cron/parent-reports/route.ts",
        why: "the digest endpoint existed and nothing ever called it",
      },
    ],
  },

  {
    name: "Privacy and consent",
    steps: [
      { step: "the privacy screen is in the nav", inFile: "lib/nav.ts", wires: "/privacy", why: "withdrawal must be as easy as giving" },
      {
        step: "consent can be withdrawn per purpose",
        inFile: "components/app/PrivacyView.tsx",
        wires: "/api/consent",
        why: "a withdrawal routed through support is compliance theatre",
      },
      {
        step: "data can be exported and deleted",
        inFile: "components/app/PrivacyView.tsx",
        wires: "/api/parent/data/",
        why: "the statutory rights need a button, not an email address",
      },
      {
        /* This replaced "withdrawal stops analytics at once", which checked
           for a consent cache that no longer exists. Analytics events carry
           no identity now, so there is no analytics consent to withdraw and
           nothing to invalidate — the check to keep is that the identity
           really is gone. */
        step: "analytics events carry no student identity",
        inFile: "app/api/analytics/route.ts",
        wires: "No identity, ever",
        why: "the collector used to read the session cookie and store a child's id without ever consulting their consent",
      },
      {
        step: "the legal pages exist",
        file: "app/privacy-policy/page.tsx",
        why: "the consent screen records a policy version whose text has to be readable",
      },
    ],
  },

  {
    name: "Money",
    steps: [
      {
        step: "the paywall can start a checkout",
        inFile: "components/app/Paywall.tsx",
        wires: "/api/billing/subscribe",
        why: "a locked chapter with no way to unlock it",
      },
      {
        step: "the browser waits for the webhook rather than granting access",
        inFile: "components/app/Paywall.tsx",
        wires: "/api/billing/status",
        why: "the success callback fires before settlement and is a fetch anyone can make",
      },
      {
        step: "the webhook is the only thing that grants",
        file: "app/api/webhooks/razorpay/route.ts",
        why: "everything else is a suggestion",
      },
      {
        step: "cost is charged to a ledger",
        inFile: "lib/ai/stream.ts",
        wires: "credit_ledger",
        why: "the table existed and nothing wrote to it",
      },
    ],
  },

  {
    name: "Operations",
    steps: [
      { step: "the admin index links the consoles", inFile: "app/admin/page.tsx", wires: "/admin/safety", why: "four URLs nobody remembers is four consoles nobody opens" },
      {
        step: "the safety queue has a reviewer screen",
        file: "components/admin/SafetyQueue.tsx",
        why: "flags accumulated with no interface at all",
      },
      {
        step: "the health page shows activation",
        inFile: "app/admin/health/page.tsx",
        wires: "activation_by_cohort",
        why: "the one number was computable and invisible",
      },
      {
        step: "errors have somewhere to go",
        inFile: "app/api/tutor/session/[id]/turn/route.ts",
        wires: "reportError",
        why: "every failure path called console.error and stopped",
      },
      {
        step: "the eval runner reads the regressions folder",
        inFile: "evals/run.ts",
        wires: "evals/regressions",
        why: "the folder that compounds only compounds if something reads it",
      },
    ],
  },
  {
    /* This whole flow is about one class of bug that nothing else here can
       see. The service-role key bypasses row-level security completely, so
       every server read of the curriculum is a place where one institute's
       material can be served to another institute's student — and it will
       look perfectly correct while doing it. The policies in tenancy.sql
       protect the browser; these greps are what protect the server. */
    name: "Tenancy",
    steps: [
      {
        step: "the curriculum knows who owns it",
        inFile: "supabase/tenancy.sql",
        wires: "can_see_content",
        why: "without the function the read policies stay `using (true)` and every org sees every org",
      },
      {
        step: "the tenancy migration is in the bundle",
        inFile: "scripts/build-migration.ts",
        wires: "tenancy.sql",
        why: "a migration nobody pastes is a migration that does not exist",
      },
      {
        step: "the topic list is scoped",
        inFile: "app/(dashboard)/tutor/page.tsx",
        wires: "scoped(",
        why: "the index is the one screen that lists content it was never asked for by id",
      },
      {
        step: "starting a session checks the topic is visible",
        inFile: "app/api/tutor/session/route.ts",
        wires: "canSee(",
        why: "a topic id guessed from another org would otherwise start a real session on it",
      },
      {
        step: "practice questions are scoped",
        inFile: "app/api/tutor/practice/next/route.ts",
        wires: "scoped(",
        why: "the question bank is the largest thing an institute pays to keep to itself",
      },
      {
        step: "marking checks the question is visible",
        inFile: "app/api/tutor/practice/attempt/route.ts",
        wires: "canSee(",
        why: "marking returns the solution, so an unscoped attempt leaks the answer key",
      },
      {
        step: "publishing carries the owner onto the row",
        inFile: "app/api/admin/content/[id]/route.ts",
        wires: "org_id: draft.org_id",
        why: "content published with a null org lands in the shared base and goes to every customer",
      },
      {
        step: "an org admin cannot publish shared content",
        inFile: "lib/admin/access.ts",
        wires: "Only the platform team can publish shared content",
        why: "org_id: null in a request body is the whole attack",
      },
      {
        step: "the seed script can target one institute",
        inFile: "scripts/seed-content.ts",
        wires: "--org",
        why: "otherwise a customer's pack can only be loaded as shared content",
      },
      {
        step: "seeded ids cannot collide with the shared curriculum",
        inFile: "scripts/seed-content.ts",
        wires: "const scope =",
        why: "an institute reusing the vendor's subject id would upsert over it and remove it from everyone else",
      },
      {
        step: "an institute can be given its first administrator",
        inFile: "app/api/admin/schools/route.ts",
        wires: "assign_admin",
        why: "creating an org does not create its admin, so without this the customer can never open their own console",
      },
      {
        step: "...and the console has a control for it",
        inFile: "components/admin/SchoolsConsole.tsx",
        wires: "Make admin",
        why: "an endpoint reachable only by hand-written curl is an endpoint nobody uses",
      },
      {
        step: "the roster console refuses another org's section",
        inFile: "app/api/admin/schools/route.ts",
        wires: "mayTouch(",
        why: "a section id in a request body is otherwise a free pass into any customer's roster",
      },
      {
        step: "cross-tenant isolation is actually tested",
        inFile: "scripts/verify-rls.ts",
        wires: "One organisation cannot read another's curriculum",
        why: "tenancy asserted in comments and never executed is tenancy nobody has",
      },
    ],
  },
];

/* --------------------------------------------------------------------------
   Everything under app/, lib/ and components/, read once.
   -------------------------------------------------------------------------- */
function sources(): Map<string, string> {
  const files = new Map<string, string>();

  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        walk(full);
      } else if (/\.(ts|tsx|sql)$/.test(entry)) {
        files.set(
          full.slice(ROOT.length + 1).replace(/\\/g, "/"),
          readFileSync(full, "utf8"),
        );
      }
    }
  };

  /* supabase/ is here because a policy is wiring too. "Every institute can
     read every other institute's curriculum" is not a missing link between two
     screens — it is one `using (true)` that survived — and that is exactly the
     kind of thing this file exists to notice. */
  for (const dir of ["app", "lib", "components", "evals", "scripts", "supabase"]) {
    walk(join(ROOT, dir));
  }

  return files;
}

function main() {
  const files = sources();
  const all = [...files.values()].join("\n");

  let passed = 0;
  const failures: string[] = [];

  for (const flow of FLOWS) {
    console.log(`\n${flow.name}`);

    for (const step of flow.steps) {
      const problems: string[] = [];

      if (step.file && !files.has(step.file)) {
        problems.push(`${step.file} does not exist`);
      }

      if (step.wires) {
        const haystack = step.inFile ? (files.get(step.inFile) ?? "") : all;

        if (step.inFile && !files.has(step.inFile)) {
          problems.push(`${step.inFile} does not exist`);
        } else if (!haystack.includes(step.wires)) {
          problems.push(
            `"${step.wires}" not found in ${step.inFile ?? "the codebase"}`,
          );
        }
      }

      if (problems.length === 0) {
        passed += 1;
        console.log(`  ok    ${step.step}`);
      } else {
        console.log(`  BROKEN ${step.step}`);
        failures.push(`${flow.name} → ${step.step}\n      ${problems.join("; ")}\n      why it matters: ${step.why}`);
      }
    }
  }

  console.log(`\n${passed} connected, ${failures.length} broken`);

  if (failures.length > 0) {
    console.log("");
    failures.forEach((failure) => console.log(`  ${failure}\n`));
    process.exit(1);
  }

  console.log(
    "\nThis proves the wiring exists, not that a fourteen-year-old finds it.\n" +
      "Walking the app is still the real test.",
  );
}

main();
