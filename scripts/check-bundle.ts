/* The performance budget, enforced.
 *
 *   npm run build && npm run check:bundle
 *
 * ---------------------------------------------------------------------------
 * WHY A NUMBER IN A README IS NOT A BUDGET
 *
 * "Initial JS under 150 KB" has been written down since the first design
 * document and nothing has ever checked it. Bundles do not regress in one
 * commit that anyone would notice; they regress a few kilobytes at a time,
 * across a month, in diffs that each look reasonable. By the time somebody
 * measures, the fix is a week of work.
 *
 * The audience makes this sharper than usual. A student on a mid-range Android
 * over a congested 4G cell pays for every kilobyte in seconds of blank screen,
 * and they are exactly the student least likely to wait.
 *
 * So this reads Next's own build manifests and fails the build over a
 * threshold. It is deliberately not clever: no gzip estimation, no tree
 * analysis, just the same first-load figure `next build` prints, compared to a
 * ceiling.
 *
 * ---------------------------------------------------------------------------
 * RAISING THE LIMIT IS ALLOWED
 *
 * It is a budget, not a law. If a route genuinely needs more, raise it here in
 * the same commit that spends it, so the decision is visible in review rather
 * than discovered in a Lighthouse run six weeks later. */

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

/* Matches next.config.mjs. A build sent elsewhere to avoid colliding with a
   running dev server must still be the build that gets measured. */
const DIST = process.env.NEXT_DIST_DIR || ".next";

/* Kilobytes of first-load JavaScript, GZIPPED.
 *
 * Gzipped because that is what crosses the network and what the stated budget
 * has always meant. Summing raw bytes instead reads three to four times higher
 * and makes every route look catastrophic, which is a budget nobody believes
 * and therefore a budget nobody keeps.
 *
 * 150 is the number from the original design note. The app shell alone is
 * around 100, so this is tight — which is the point. */
const DEFAULT_LIMIT_KB = 150;

/* Routes allowed to exceed it, with the reason.
 *
 * Every entry is a decision somebody made on purpose. An empty list would mean
 * the budget had never been tested against reality; a list that grows every
 * month means the budget has stopped meaning anything.
 *
 * The pre-existing routes below were over before this check existed. They are
 * recorded at roughly their current size rather than quietly raising the
 * default, so the debt is visible and the NEW routes are held to 150. */
const EXCEPTIONS: Record<string, { limitKb: number; why: string }> = {
  "/login": { limitKb: 240, why: "Supabase auth client and the OAuth flow. Loaded once, before a student is a student." },
  "/signup": { limitKb: 240, why: "Same as /login." },
  "/notes": { limitKb: 240, why: "The notes canvas. Pre-existing; worth revisiting." },
  "/onboarding": { limitKb: 250, why: "Five steps and the waiting games in one route. Pre-existing." },
  "/onboarding/[step]": { limitKb: 260, why: "Same as /onboarding." },
  "/dashboard": { limitKb: 200, why: "Framer Motion and the charts. Pre-existing." },
  "/roadmap": { limitKb: 205, why: "Pre-existing." },
  "/progress": { limitKb: 200, why: "Charts. Pre-existing." },
  "/questions": { limitKb: 200, why: "Pre-existing." },
  "/mock-papers": { limitKb: 200, why: "Pre-existing." },
  "/settings": { limitKb: 200, why: "Pre-existing." },
  "/exams": { limitKb: 195, why: "Pre-existing." },
  "/faq": { limitKb: 195, why: "Pre-existing." },
  "/feedback": { limitKb: 195, why: "Pre-existing." },
  "/fix-sheet": { limitKb: 195, why: "Pre-existing." },
  "/papers": { limitKb: 190, why: "Pre-existing." },
  "/": { limitKb: 200, why: "The marketing page: Lenis, Framer, every section. Judged on LCP, not on this." },
};

type Manifest = {
  pages: Record<string, string[]>;
};

function kb(bytes: number) {
  return Math.round((bytes / 1024) * 10) / 10;
}

/* `static/chunks/main-app.js` on disk is `main-app-dfae8d46….js`.
   Returns the emitted file for a logical manifest entry, or null when nothing
   with that prefix exists — which is the case worth failing on. */
function hashedSibling(path: string): string | null {
  const dir = dirname(path);
  if (!existsSync(dir)) return null;

  /* Prefix matching rather than a built regex: the stem can contain dots and
     brackets from a route group, and escaping those into a pattern is a line
     that goes wrong quietly. `main-app` + `-` + hash + `.js` is the whole
     shape. */
  const stem = basename(path).replace(/\.js$/, "");

  const match = readdirSync(dir).find(
    (name) => name.startsWith(`${stem}-`) && name.endsWith(".js"),
  );

  return match ? join(dir, match) : null;
}

/* Every page.tsx under app/, so the manifest can be checked against reality
   rather than against a number somebody typed. */
function countPages(dir: string): number {
  if (!existsSync(dir)) return 0;

  let total = 0;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      total += countPages(join(dir, entry.name));
    } else if (entry.name === "page.tsx") {
      total += 1;
    }
  }

  return total;
}

function main() {
  const buildManifest = resolve(ROOT, `${DIST}/app-build-manifest.json`);

  if (!existsSync(buildManifest)) {
    console.error("No build found. Run `npm run build` first.");
    process.exit(1);
  }

  /* Is this ONE build, or the wreckage of two?
   *
   * Two `next build` runs at once — two terminals, two sessions, a build while
   * `next dev` is up — leave .next holding chunks from both. The manifest is
   * from whichever finished last and names files the other one wrote, so the
   * numbers below are of a build that never existed. It has produced `/ is
   * 2488 KB, over its 200 KB limit` on a route that was 130 KB minutes
   * earlier.
   *
   * That is worse than no check. A budget that reports nonsense confidently
   * gets one of two responses, and both are bad: somebody raises a limit that
   * did not need raising, or somebody learns to ignore the tool.
   *
   * BUILD_ID is rewritten at the end of every build, so anything in .next
   * older than it belongs to a previous run. */
  const buildIdPath = resolve(ROOT, `${DIST}/BUILD_ID`);

  if (!existsSync(buildIdPath)) {
    console.error("The build did not finish — .next/BUILD_ID is missing.");
    console.error("Run `npm run build` again and let it complete.");
    process.exit(1);
  }

  const builtAt = statSync(buildIdPath).mtimeMs;

  const manifest = JSON.parse(readFileSync(buildManifest, "utf8")) as Manifest;

  /* Does the manifest describe THIS app?
   *
   * The strongest signal there is, and the one the checks above miss. A
   * half-written .next can be internally consistent — every file it names is
   * present and current — and still describe one route out of ninety, because
   * the other build removed the rest. That reports "all 1 routes within
   * budget", which is a pass, in green, meaning nothing.
   *
   * So it is counted against the pages that exist in the repository. Half is a
   * wide bar on purpose: route groups and parallel routes make an exact match
   * brittle, and the case being caught is 1 versus 93, not 89 versus 90. */
  const pageFiles = countPages(resolve(ROOT, "app"));
  const routes = Object.keys(manifest.pages).filter((key) => !key.endsWith("/layout")).length;

  if (pageFiles > 0 && routes < pageFiles / 2) {
    console.error(`The build covers ${routes} routes; the repository has ${pageFiles} pages.`);
    console.error("");
    console.error("That is a partial build — most likely two builds overlapped, or one");
    console.error("was interrupted. Measuring it would report a budget nobody built.");
    console.error("Run: rm -rf .next && npm run build");
    process.exit(1);
  }

  /* Every route's first load is its own chunks plus the shared ones. Summing
     unique files across the entry is what Next itself reports. */
  const sizes: { route: string; bytes: number }[] = [];

  for (const [rawRoute, files] of Object.entries(manifest.pages)) {
    /* Layouts are not routes. Their chunks are already counted inside every
       page that uses them, and normalising "/(dashboard)/layout" collapses it
       onto "/" — where it shadowed the marketing page and reported its size
       as the landing page's. */
    if (rawRoute.endsWith("/layout")) continue;

    /* "/(dashboard)/tutor/[topicId]/page" is the manifest key; "/tutor/
       [topicId]" is what anyone reading this thinks of as the route, and what
       the exceptions above are keyed by. */
    const route =
      rawRoute.replace(/\/page$/, "").replace(/\/\([^)]*\)/g, "") || "/";

    let bytes = 0;
    const counted = new Set<string>();

    for (const file of files) {
      if (!file.endsWith(".js") || counted.has(file)) continue;
      counted.add(file);

      let path = resolve(ROOT, DIST, file);

      /* Missing under that exact name is not automatically wrong.
         The manifest carries logical entries — `static/chunks/main-app.js` —
         whose emitted file is content-hashed: `main-app-dfae8d46….js`. The
         original code skipped anything absent, which covered this case and
         also, silently, a genuinely incomplete build.
         So: resolve the hashed sibling. If one exists it is the file and gets
         counted, which the skip never did. If nothing with that prefix is
         there at all, the build really is missing a chunk and that is worth
         stopping for. */
      if (!existsSync(path)) {
        const sibling = hashedSibling(path);

        if (!sibling) {
          console.error(`${route} names a chunk that is not there in any form:`);
          console.error(`  ${file}`);
          console.error("");
          console.error("The build is incomplete, or two builds overlapped and left");
          console.error(".next holding pieces of both.");
          console.error("Run: rm -rf .next && npm run build");
          process.exit(1);
        }

        path = sibling;
      }

      /* On disk, but from an older session.
         The margin is deliberately enormous. Chunks are ALWAYS older than
         BUILD_ID — they are written during compilation and BUILD_ID at the
         end, about ten seconds apart in this project — so a tight threshold
         fails every honest build, which is the first thing this check did when
         it was written with one second of slack.
         Half an hour cannot elapse inside one `next build` here (they take
         under a minute) and reliably separates "this build" from "a build from
         earlier today". A weak signal used at a width where it cannot be wrong
         is better than a precise one that cries wolf. */
      if (statSync(path).mtimeMs < builtAt - 30 * 60 * 1000) {
        console.error(`${route} is being measured against a chunk from an older build:`);
        console.error(`  ${file}`);
        console.error("");
        console.error("Run: rm -rf .next && npm run build");
        process.exit(1);
      }

      /* Gzipped, because that is what the student downloads. Level 6 is what
         every CDN uses by default, so this tracks reality rather than a
         best-case brotli figure nobody serves. */
      bytes += gzipSync(readFileSync(path), { level: 6 }).byteLength;
    }

    sizes.push({ route, bytes });
  }

  sizes.sort((a, b) => b.bytes - a.bytes);

  const failures: string[] = [];

  console.log(`First-load JS per route (limit ${DEFAULT_LIMIT_KB} KB)\n`);

  for (const { route, bytes } of sizes) {
    const exception = EXCEPTIONS[route];
    const limit = exception?.limitKb ?? DEFAULT_LIMIT_KB;
    const size = kb(bytes);
    const over = size > limit;

    if (over) {
      failures.push(
        `${route} is ${size} KB, over its ${limit} KB limit` +
          (exception ? ` (exception: ${exception.why})` : ""),
      );
    }

    /* Only print the interesting ones. A list of forty routes at 110 KB is a
       list nobody reads. */
    if (over || size > limit * 0.85) {
      console.log(
        `  ${over ? "OVER" : "near"}  ${route.padEnd(34)} ${String(size).padStart(7)} KB / ${limit}`,
      );
    }
  }

  if (failures.length === 0) {
    console.log(`  all ${sizes.length} routes within budget`);
    console.log(
      "\nBudget is GZIPPED first-load JS, which is what crosses the network.\n" +
        "Raise a limit in this file in the same commit that spends it, so the\n" +
        "trade is visible in review rather than found in a Lighthouse run later.",
    );
    return;
  }

  console.log("\nOver budget:\n");
  failures.forEach((failure) => console.log(`  ${failure}`));
  console.log(
    "\nEither trim the route — a dynamic import is usually enough, as it was for\n" +
      "KaTeX on the tutor screen — or raise its limit here and say why.",
  );

  process.exit(1);
}

main();
