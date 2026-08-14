/* The order the migrations must run in, and why.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ITS OWN FILE
 *
 * It used to live inside build-migration.ts, which calls main() at the bottom
 * — so importing the list meant regenerating supabase/all.sql as a side
 * effect. The migration runner needs the same list, and two copies of a
 * dependency order is exactly the drift this list exists to prevent: the
 * bundle would paste them in one order and the runner would apply them in
 * another, and nothing would say so.
 *
 * Each entry records what breaks if it runs too early, because that is the
 * only thing anyone needs to know before reordering it.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY ABSENT
 *
 * schema.sql        the pre-existing app's, and may already be applied.
 * cron.sql          schedules a job against a URL and a secret filled in by
 *                   hand. A scheduler pointing at REPLACE-ME is worse than no
 *                   scheduler: it looks configured.
 * all.sql           generated FROM this list. Running it would re-run
 *                   everything in it a second time.
 * verify.sql        a test suite, not a migration. It asserts; it does not
 *                   install.
 * ---------------------------------------------------------------------------
 * THESE FILES ARE EDITED IN PLACE
 *
 * This is not a numbered-migration repo where a file, once applied, is frozen.
 * tenancy.sql rewrites what schools.sql did; licensing.sql has the last word on
 * can_access_chapter after three files have touched it. Fixes land by editing
 * the file that owns the object and running it again.
 *
 * That is why every one of them is written to be re-runnable — `create table
 * if not exists`, `create or replace`, `on conflict do nothing`, guarded
 * `do $$` blocks for constraints — and why the runner re-applies a file whose
 * contents have changed rather than treating it as done for ever. */

export type Migration = { file: string; needs: string };

export const ORDER: Migration[] = [
  { file: "tutor.sql", needs: "schema.sql — adds columns to its `attempts` table" },
  { file: "compliance.sql", needs: "schema.sql for profiles, tutor.sql for the retention job's tables" },
  {
    file: "roles.sql",
    needs:
      "compliance.sql, which adds profiles.role — this closes it to ('student','teacher') and migrates the old 'parent' rows",
  },
  { file: "schools.sql", needs: "tutor.sql for topics and topic_mastery" },
  { file: "billing.sql", needs: "schools.sql — can_access_chapter reads org_members" },
  { file: "ratelimit.sql", needs: "nothing, but compliance.sql's purge calls into it" },
  { file: "analytics.sql", needs: "tutor.sql for llm_calls and error_events" },
  {
    file: "tenancy.sql",
    needs:
      "schools.sql (extends org_members) and billing.sql (replaces can_access_chapter) — it rewrites what came before",
  },
  {
    file: "schoolops.sql",
    needs:
      "tenancy.sql for is_org_admin and my_org_ids — and it replaces teaches_section, so it must come after the copy in tenancy.sql",
  },
  {
    file: "licensing.sql",
    needs:
      "schoolops.sql for boards and grades, and tenancy.sql — LAST word on can_access_chapter, which three files now touch",
  },
  { file: "assessment.sql", needs: "schoolops.sql for the corrected teaches_section, tutor.sql for bank_questions" },
  { file: "comms.sql", needs: "tenancy.sql for is_org_admin, schools.sql for sections" },
  {
    file: "onboarding.sql",
    needs:
      "all of the above — it creates an org, a licence, a year and an audit row in one transaction, so it is genuinely last",
  },
  {
    file: "countries.sql",
    needs:
      "schoolops.sql, which creates the boards and grades tables this seeds — the US curricula and Kindergarten, so lib/syllabus.ts and the database agree on which board codes exist",
  },
];
