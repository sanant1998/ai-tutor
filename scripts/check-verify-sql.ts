/* Is the verification SQL still safe to paste into a production database?
 *
 *   npm run db:lint
 *
 * ---------------------------------------------------------------------------
 * WHY A SCRIPT AND NOT A COMMENT
 *
 * supabase/verify/10-behaviour.sql runs against the real project — there is no
 * throwaway database any more — and it is only safe because of three
 * properties that are invisible while reading a diff:
 *
 *   it opens with BEGIN,
 *   it closes with ROLLBACK,
 *   and nothing executable follows the ROLLBACK.
 *
 * A section appended below that last line does not fail. It runs, outside the
 * transaction, against production, and its fixtures — a school, seven users, a
 * licence — stay there. That has already happened once: a section was added
 * after the teardown and only failed because it also used a psql meta-command,
 * which is the sort of luck nothing should depend on twice.
 *
 * The file carries an ADD NEW SECTIONS ABOVE THIS LINE banner. This is what
 * makes the banner mean something, because the person who appends past it is
 * by definition someone who did not read it.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT CHECKS
 *
 *   1. No psql meta-commands. The Supabase SQL editor is not psql; \echo is a
 *      syntax error there, at a line number that points at the wrong thing.
 *   2. BEGIN first, ROLLBACK last, nothing executable after it.
 *   3. Section numbers unique and in order — two files edited by two people
 *      produced a duplicate "15" once, and a duplicate number in a 1000-line
 *      file is how two failures get read as one.
 *   4. No fixture used before the statement that creates it. The board is a
 *      foreign key for both orgs and subjects, and inserting it next to the
 *      curriculum put it after the school that referenced it. */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIR = resolve(ROOT, "supabase/verify");

type Problem = { file: string; line: number; message: string };

const problems: Problem[] = [];

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/* Comment and blank lines are not statements. Everything else is, which is the
   conservative reading: a stray `select 1` after the rollback is exactly the
   thing being looked for. */
function isExecutable(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 0 && !trimmed.startsWith("--");
}

function check(file: string) {
  const text = readFileSync(resolve(DIR, file), "utf8");
  const lines = text.split("\n");
  const add = (line: number, message: string) => problems.push({ file, line, message });

  /* 1. psql meta-commands. */
  lines.forEach((line, index) => {
    if (/^\s*\\/.test(line)) {
      add(index + 1, `psql meta-command \`${line.trim().split(/\s/)[0]}\` — the SQL editor is not psql`);
    }
  });

  /* 2. The transaction. */
  const executable = lines
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => isExecutable(line));

  if (executable.length === 0) {
    add(1, "no statements at all");
    return;
  }

  if (!/^begin\s*;/i.test(executable[0]!.line.trim())) {
    add(executable[0]!.number, "the first statement must be BEGIN, or the fixtures are permanent");
  }

  const rollbackAt = executable.findIndex(({ line }) => /^rollback\s*;/i.test(line.trim()));

  if (rollbackAt === -1) {
    add(executable.at(-1)!.number, "no ROLLBACK — this file writes to a production database");
  } else {
    for (const { line, number } of executable.slice(rollbackAt + 1)) {
      add(number, `runs AFTER the rollback, outside the transaction: \`${line.trim().slice(0, 48)}\``);
    }
  }

  /* 3. Section numbering. */
  const sections = [...text.matchAll(/raise notice '=== (\d+)\./g)].map((match) => ({
    number: Number(match[1]),
    at: lineOf(text, match.index!),
  }));

  const seen = new Map<number, number>();
  let previous = 0;

  for (const section of sections) {
    if (seen.has(section.number)) {
      add(section.at, `section ${section.number} is already used at line ${seen.get(section.number)}`);
    }
    seen.set(section.number, section.at);

    if (section.number < previous) {
      add(section.at, `section ${section.number} comes after ${previous}`);
    }
    previous = section.number;
  }

  /* 4. Fixtures used before they exist.
     The id of each inserted row — the first literal in the first VALUES tuple
     — must not appear anywhere earlier in the file. */
  const inserts = [
    ...text.matchAll(
      /insert into public\.(\w+)\s*\(\s*(?:id|code)\b[^)]*\)\s*values\s*(?:\r?\n\s*)?\(\s*'([^']+)'/gi,
    ),
  ];

  for (const insert of inserts) {
    const [, table, id] = insert;
    const definedAt = insert.index!;
    const firstUse = text.indexOf(`'${id}'`);

    if (firstUse !== -1 && firstUse < definedAt) {
      add(
        lineOf(text, firstUse),
        `${table} fixture '${id}' is used here, but not created until line ${lineOf(text, definedAt)}`,
      );
    }
  }
}

function main() {
  const files = readdirSync(DIR).filter((file) => file.endsWith(".sql"));

  if (files.length === 0) {
    console.error(`No .sql files in supabase/verify — did they move?`);
    process.exit(1);
  }

  for (const file of files) check(file);

  if (problems.length === 0) {
    console.log(`${files.length} verification file${files.length === 1 ? "" : "s"}: safe to run.`);
    console.log("  BEGIN first, ROLLBACK last, nothing after it, no meta-commands, fixtures in order.");
    return;
  }

  console.error(`${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);

  for (const problem of problems) {
    console.error(`  supabase/verify/${problem.file}:${problem.line}`);
    console.error(`    ${problem.message}\n`);
  }

  process.exit(1);
}

main();
