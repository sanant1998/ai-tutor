/* Checks every content pack under content/ and prints what is wrong.
 *
 *   node scripts/validate-content.ts
 *   node scripts/validate-content.ts --strict     warnings fail too
 *
 * Run under plain node — no build step, no ts-node. Node strips the types.
 * That is why the imports below carry a .ts extension and no @/ alias: the
 * alias is a bundler feature and this file never meets the bundler.
 *
 * The seed script runs this first and refuses to push on an error, so a broken
 * pack cannot reach the database by going round it. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ContentFile } from "../lib/content/pack.ts";
import { validateCollection, validateFile, type Issue } from "../lib/content/validate.ts";

/* fileURLToPath rather than new URL().pathname: this repo lives at
   "E:\AI Tutour", and .pathname hands back "/E:/AI%20Tutour" — a leading slash
   and an undecoded space, neither of which the fs module will open. */
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CONTENT_DIR = join(ROOT, "content");

export type Loaded = { path: string; file: ContentFile };

export function loadPacks(dir = CONTENT_DIR): Loaded[] {
  const found: Loaded[] = [];

  const walk = (current: string) => {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".json")) {
        found.push({
          path: relative(ROOT, full).replace(/\\/g, "/"),
          file: JSON.parse(readFileSync(full, "utf8")) as ContentFile,
        });
      }
    }
  };

  walk(dir);
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

function main() {
  const strict = process.argv.includes("--strict");
  const packs = loadPacks();

  if (packs.length === 0) {
    console.error(`No content packs found under ${CONTENT_DIR}`);
    process.exit(1);
  }

  let errors = 0;
  let warnings = 0;

  for (const { path, file } of packs) {
    const issues = validateFile(file);
    report(path, issues);
    errors += issues.filter((issue) => issue.severity === "error").length;
    warnings += issues.filter((issue) => issue.severity === "warn").length;
  }

  const across = validateCollection(packs.map((pack) => pack.file));
  if (across.length > 0) {
    report("across all packs", across);
    errors += across.filter((issue) => issue.severity === "error").length;
    warnings += across.filter((issue) => issue.severity === "warn").length;
  }

  /* The numbers worth watching over time. A chapter is ready to teach when
     every concept has misconceptions and every wrong option maps to one. */
  const concepts = packs.reduce((n, pack) => n + pack.file.concepts.length, 0);
  const questions = packs.reduce((n, pack) => n + pack.file.questions.length, 0);
  const mapped = packs.reduce(
    (n, pack) =>
      n +
      pack.file.questions.reduce(
        (m, question) => m + Object.keys(question.distractor_map ?? {}).length,
        0,
      ),
    0,
  );

  console.log(
    `\n${packs.length} pack${packs.length === 1 ? "" : "s"} · ${concepts} concepts · ${questions} questions · ${mapped} mapped distractors`,
  );
  console.log(`${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`);

  if (errors > 0 || (strict && warnings > 0)) process.exit(1);
}

function report(path: string, issues: Issue[]) {
  if (issues.length === 0) {
    console.log(`  ok  ${path}`);
    return;
  }

  console.log(`\n${path}`);
  for (const issue of issues) {
    const tag = issue.severity === "error" ? "ERROR" : " warn";
    console.log(`  ${tag}  ${issue.where}\n         ${issue.message}`);
  }
}

/* Run when invoked directly, stay quiet when imported by seed-content.ts.
   Comparing resolved paths rather than URL strings, for the same reason. */
if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? "")) {
  main();
}
