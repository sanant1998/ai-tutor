/* Pushes every content pack under content/ into Postgres.
 *
 *   node scripts/seed-content.ts
 *   node scripts/seed-content.ts --dry           validate, write nothing
 *   node scripts/seed-content.ts --org <uuid>    push into one institute
 *
 * Without --org the pack becomes SHARED base curriculum, visible to every
 * student on the platform. With it, only that organisation sees it. Getting
 * this wrong in the shared direction publishes one customer's material to
 * everyone, so the script prints which it is doing before it writes.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, read from
 * .env.local. The service-role key is required because the curriculum tables
 * are readable by students and writable by nobody through the API — which is
 * the point.
 *
 * ---------------------------------------------------------------------------
 * IDEMPOTENT, AND VALIDATED FIRST
 *
 * Every row is an upsert on a textual id, so running this twice changes
 * nothing and re-running after an edit updates in place. That matters because
 * the alternative — delete and re-insert — would break every foreign key from
 * a student's attempts and error_events into the concept they were about.
 *
 * Validation runs before the first write and an error stops the whole run. A
 * half-seeded chapter is worse than an unseeded one: the tutor will happily
 * teach a concept whose questions did not make it. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import type { ContentFile } from "../lib/content/pack.ts";
import { validateCollection, validateFile } from "../lib/content/validate.ts";
import { loadPacks } from "./validate-content.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

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
      /* Not there. Fine — the variables may come from the shell. */
    }
  }
}

async function main() {
  loadEnv();
  const dry = process.argv.includes("--dry");

  const orgIndex = process.argv.indexOf("--org");
  const orgId = orgIndex >= 0 ? process.argv[orgIndex + 1] : null;

  if (orgIndex >= 0 && !orgId) {
    console.error("--org needs an organisation id.");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!dry && (!url || !key)) {
    console.error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.\n" +
        "Run with --dry to validate without writing.",
    );
    process.exit(1);
  }

  const packs = loadPacks();
  console.log(`Found ${packs.length} pack${packs.length === 1 ? "" : "s"}.`);

  /* Said out loud before anything is written. Seeding one customer's material
     as shared content publishes it to every student on the platform, and that
     is one missing flag away. */
  console.log(
    orgId
      ? `Target: organisation ${orgId} — only its members will see this.`
      : "Target: SHARED base curriculum — every student on the platform will see this.",
  );

  /* --- Validate --------------------------------------------------------- */
  let errors = 0;

  for (const { path, file } of packs) {
    for (const issue of validateFile(file)) {
      if (issue.severity === "error") {
        errors += 1;
        console.error(`ERROR ${path} ${issue.where}: ${issue.message}`);
      }
    }
  }

  for (const issue of validateCollection(packs.map((pack) => pack.file))) {
    if (issue.severity === "error") {
      errors += 1;
      console.error(`ERROR ${issue.where}: ${issue.message}`);
    }
  }

  if (errors > 0) {
    console.error(`\n${errors} error${errors === 1 ? "" : "s"}. Nothing was written.`);
    process.exit(1);
  }

  console.log("Validation passed.");

  if (dry) {
    summarise(packs.map((pack) => pack.file));
    return;
  }

  /* --- Write ------------------------------------------------------------
     Parents before children, in dependency order, because every table here
     has a foreign key into the one above it. */
  const db = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const files = packs.map((pack) => pack.file);

  /* Every id an institute writes gets its organisation stamped into it.
   *
   * Without this, an institute whose pack happens to use the vendor's subject
   * id — "cbse-8-maths" is the obvious guess, so it is the likely one — would
   * upsert straight over the shared row and set org_id on it. The shared
   * subject would silently become that one customer's, and every other
   * organisation on the platform would stop being able to see it. The upsert
   * is on the id, so nothing would error; the curriculum would just vanish for
   * everyone else.
   *
   * Prefixing makes the collision impossible rather than detectable. It is
   * deterministic, so re-seeding the same org still upserts in place and the
   * script stays idempotent. Shared packs keep their ids untouched. */
  const scope = (id: string) => (orgId ? `${orgId.slice(0, 8)}:${id}` : id);

  const subjects = dedupe(
    files.map((file) => ({
      id: scope(file.subject.id),
      org_id: orgId,
      board: file.board,
      class_level: file.classLevel,
      subject_id: file.subjectId,
      name: file.subject.name,
      language: file.subject.language ?? "en-IN",
    })),
  );

  const chapters = dedupe(
    files.map((file) => ({
      id: scope(file.chapter.id),
      org_id: orgId,
      subject_ref: scope(file.subject.id),
      chapter_no: file.chapter.no,
      title: file.chapter.title,
      ncert_ref: file.chapter.ncertRef ?? null,
      est_minutes: file.chapter.estMinutes ?? 45,
      is_free: file.chapter.isFree ?? false,
    })),
  );

  const topics = files.map((file) => ({
    id: scope(file.topic.id),
    org_id: orgId,
    chapter_ref: scope(file.chapter.id),
    topic_no: file.topic.no,
    title: file.topic.title,
    /* Scoped too, or a prerequisite would point at the shared topic of the
       same name rather than the institute's own. */
    prereq_topic_ids: (file.topic.prereqTopicIds ?? []).map(scope),
  }));

  const concepts = files.flatMap((file) =>
    file.concepts.map((concept) => ({
      id: scope(concept.id),
      org_id: orgId,
      topic_ref: scope(file.topic.id),
      seq: concept.seq,
      title: concept.title,
      statement: concept.statement,
      hook: concept.hook ?? null,
      analogies: concept.analogies ?? [],
      misconceptions: concept.misconceptions ?? [],
      worked_examples: concept.worked_examples ?? [],
      formulas: concept.formulas ?? [],
    })),
  );

  const questions = files.flatMap((file) =>
    file.questions.map((question) => ({
      id: scope(question.id),
      org_id: orgId,
      topic_ref: scope(file.topic.id),
      concept_ref: question.conceptId ? scope(question.conceptId) : null,
      qtype: question.qtype,
      level: question.level,
      stem: question.stem,
      options: question.options ?? null,
      correct: question.correct,
      solution: question.solution,
      /* Not scoped: these keys are option letters and misconception ids local
         to this question's own concept, not references to rows. */
      distractor_map: question.distractor_map ?? {},
      marks: question.marks ?? 4,
      negative_marks: question.negative_marks ?? 1,
      source: question.source ?? file.provenance.source.slice(0, 300),
    })),
  );

  /* Belt and braces. If an id somehow still lands on a row belonging to
     somebody else, stop before writing rather than after. */
  const clash = await findForeignRow(db, "subjects", subjects, orgId);
  if (clash) {
    console.error(
      `\nsubjects.${clash} already exists and belongs to a different owner. ` +
        "Nothing was written.",
    );
    process.exit(1);
  }

  const steps: [string, unknown[]][] = [
    ["subjects", subjects],
    ["chapters", chapters],
    ["topics", topics],
    ["concepts", concepts],
    ["bank_questions", questions],
  ];

  for (const [table, rows] of steps) {
    if (rows.length === 0) continue;

    const { error } = await db.from(table).upsert(rows as never, { onConflict: "id" });

    if (error) {
      console.error(`\nFailed writing ${table}: ${error.message}`);
      console.error(
        table === "subjects"
          ? "Has supabase/tutor.sql been run on this project?"
          : "Earlier tables were written; fix and re-run — the upserts are idempotent.",
      );
      process.exit(1);
    }

    console.log(`  ${table}: ${rows.length}`);
  }

  summarise(files);
}

/* Returns the id of the first row that already exists under a different owner,
   or null if the batch is safe to write. Only the top of the tree is checked —
   everything below it hangs off a subject, so a clean subject means the rest
   cannot be reachable by anyone else either. */
async function findForeignRow(
  db: { from: (table: string) => unknown },
  table: string,
  rows: { id: string }[],
  orgId: string | null,
): Promise<string | null> {
  if (rows.length === 0) return null;

  /* Untyped on purpose. The generated Supabase client types do not follow a
     table name held in a variable, and this helper deliberately takes one. */
  const query = db.from(table) as {
    select: (columns: string) => {
      in: (
        column: string,
        values: string[],
      ) => Promise<{ data: { id: string; org_id: string | null }[] | null }>;
    };
  };

  const { data } = await query.select("id, org_id").in(
    "id",
    rows.map((row) => row.id),
  );

  const foreign = (data ?? []).find((row) => row.org_id !== orgId);

  return foreign ? foreign.id : null;
}

/* Every topic file repeats its chapter, so the same chapter arrives once per
   topic and the repeats have to collapse. They must be IDENTICAL repeats.
 *
 * This used to be `byId.set(row.id, row)` and nothing else: last write wins,
 * silently. Two different chapters sharing an id — which is one typo, or one
 * new textbook whose chapter 1 is not the old book's chapter 1 — collapsed
 * into whichever file the directory walk reached last. One title vanished,
 * both sets of topics hung off the survivor, and the seeder printed a happy
 * count. Nothing downstream could tell, because by then there was only one
 * row. An id collision is a content bug, and the seeder is the last place it
 * is still cheap to see. */
function dedupe<T extends { id: string }>(rows: T[]): T[] {
  const byId = new Map<string, T>();
  const clashes: string[] = [];

  for (const row of rows) {
    const seen = byId.get(row.id);

    if (seen && JSON.stringify(seen) !== JSON.stringify(row)) {
      clashes.push(
        `  ${row.id}\n` +
          `    already seen as: ${JSON.stringify(seen)}\n` +
          `    now claimed as:  ${JSON.stringify(row)}`,
      );
      continue;
    }

    byId.set(row.id, row);
  }

  if (clashes.length > 0) {
    throw new Error(
      `Two content files claim the same id with different contents:\n\n${clashes.join("\n\n")}\n\n` +
        "Ids are permanent — questions and recorded mistakes point at them — so " +
        "nothing is guessed here. Give one of them a different id.",
    );
  }

  return [...byId.values()];
}

function summarise(files: ContentFile[]) {
  const concepts = files.reduce((n, file) => n + file.concepts.length, 0);
  const questions = files.reduce((n, file) => n + file.questions.length, 0);

  const byLevel = new Map<string, number>();
  for (const file of files) {
    for (const question of file.questions) {
      byLevel.set(question.level, (byLevel.get(question.level) ?? 0) + 1);
    }
  }

  console.log(
    `\n${files.length} topics · ${concepts} concepts · ${questions} questions ` +
      `(${[...byLevel.entries()].sort().map(([level, n]) => `${level} ${n}`).join(", ")})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
