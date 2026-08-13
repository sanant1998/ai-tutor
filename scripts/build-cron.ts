/* Writes supabase/cron.generated.sql with the URL and secret filled in.
 *
 *   npm run db:cron
 *
 * ---------------------------------------------------------------------------
 * WHY cron.sql CANNOT JUST BE PASTED
 *
 * It is the one migration deliberately left out of all.sql, because two of its
 * lines are placeholders:
 *
 *   url     := 'https://REPLACE-ME.example.com/api/cron/parent-reports'
 *   'Authorization', 'Bearer REPLACE-WITH-CRON_SECRET'
 *
 * Pasted as-is, pg_cron accepts it and schedules happily. Every Sunday at 19:00
 * IST it then POSTs to example.com, gets nothing back, and no parent receives a
 * report — while the schedule list shows three healthy jobs. A scheduler
 * pointing at REPLACE-ME is worse than no scheduler, because it looks
 * configured.
 *
 * Editing the two lines by hand is a thirty-second job that has not been done
 * in the weeks the file has existed, which is the usual fate of a thirty-second
 * job with no error attached to it. So: generate it.
 *
 * ---------------------------------------------------------------------------
 * FOUR OF THE FIVE JOBS NEED NO URL AT ALL
 *
 * purge_expired_data, purge_comms, purge_import_errors and expire_grace are
 * plain SQL running inside the database. Only the weekly parent report reaches
 * out over HTTP, and only it needs a deployed app.
 *
 * This script used to refuse everything when NEXT_PUBLIC_SITE_URL was unset,
 * which meant retention — a child's transcripts deleted at 24 months, voice at
 * 30 days, the thing the DPDP Act is actually about — waited on a deployment
 * it has nothing to do with. Nothing was being deleted, and the reason was a
 * missing environment variable for a different job.
 *
 * So the file is written either way. Without a URL it carries the four
 * database jobs and says the report was left out; with one, all five.
 *
 * ---------------------------------------------------------------------------
 * THE SECRET ENDS UP IN THE DATABASE EITHER WAY
 *
 * pg_cron stores the command text, so the bearer token is readable by anyone
 * who can select from cron.job — which is the postgres role, and nobody
 * reaching the database through PostgREST. That is true of hand-editing too;
 * it is stated here so it is a known property rather than a discovery.
 *
 * The generated file is gitignored for the same reason. */

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(ROOT, file), "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* Not present. */
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.CRON_SECRET;
  const source = readFileSync(resolve(ROOT, "supabase/cron.sql"), "utf8");

  /* The reports job is everything from its own comment block to the end of its
     schedule call. Split on the marker rather than on line numbers, so an edit
     to cron.sql above it cannot silently cut the wrong place. */
  const REPORTS_MARKER = "-- 13:30 UTC Sunday = 19:00 IST Sunday.";
  const REPORTS_END = "'paperpath-reports',";

  const markerAt = source.indexOf(REPORTS_MARKER);

  if (markerAt === -1 || !source.includes(REPORTS_END)) {
    console.error("cron.sql has changed shape — the reports job could not be found.");
    console.error("Check it by hand before scheduling anything.");
    process.exit(1);
  }

  const scheduleEnd = source.indexOf("\n);", source.indexOf(REPORTS_END)) + 3;

  const databaseJobs = source.slice(0, markerAt);
  const reportsJob = source.slice(markerAt, scheduleEnd);
  const tail = source.slice(scheduleEnd);

  let includeReports = false;
  const base = url ? url.replace(/\/+$/, "") : "";

  if (!url || !secret) {
    console.log("Writing the database jobs only.");
    console.log(`  ${!url ? "NEXT_PUBLIC_SITE_URL" : "CRON_SECRET"} is not set, so the weekly`);
    console.log("  parent report is left out. Retention does not depend on it.");
  } else if (base.includes("localhost") || base.includes("127.0.0.1")) {
    console.log(`NEXT_PUBLIC_SITE_URL is ${base}, which Supabase cannot reach.`);
    console.log("Writing the database jobs only; the report is left out.");
  } else {
    /* Does that URL answer, and is it this app?
       A schedule pointing at a domain that 404s looks identical in cron.job to
       one that works: it runs, gets a response, and nobody hears about it. */
    const probeUrl = `${base}/api/cron/parent-reports`;

    try {
      const response = await fetch(probeUrl, { method: "POST" });

      if (response.status === 401) {
        includeReports = true;
      } else if (response.status === 200) {
        /* Not a configuration problem: an open endpoint that spends money on
           messages. Scheduling against it would be the least of it. */
        console.error(`${probeUrl} answered 200 WITHOUT a bearer token.`);
        console.error("Anyone who finds that URL can trigger the weekly messages.");
        console.error("Fix that before scheduling anything against it.");
        process.exit(1);
      } else if (response.status === 503) {
        console.log(`${probeUrl} answered 503 — CRON_SECRET is not set on the deployment.`);
        console.log("Writing the database jobs only; set it there and run this again.");
      } else {
        console.log(`${probeUrl} answered ${response.status}, not 401.`);
        console.log("That is not this app, so the report is left out.");
      }
    } catch (error) {
      console.log(`Could not reach ${probeUrl}: ${(error as Error).message}`);
      console.log("Writing the database jobs only.");
    }
  }

  const reports = includeReports
    ? reportsJob
        .replace(
          "https://REPLACE-ME.example.com/api/cron/parent-reports",
          `${base}/api/cron/parent-reports`,
        )
        .replace("Bearer REPLACE-WITH-CRON_SECRET", `Bearer ${secret}`)
    : [
        "-- The weekly parent report is NOT scheduled here.",
        "--",
        "-- It is the only job that reaches out over HTTP, and it needs a deployed",
        "-- app and a CRON_SECRET that app also has. Everything above runs inside",
        "-- the database and needs neither.",
        "--",
        "-- Once the app is deployed: set NEXT_PUBLIC_SITE_URL and CRON_SECRET in",
        "-- .env.local, run `npm run db:cron` again, and paste the reports job it",
        "-- adds. The four jobs above will already be scheduled; re-pasting them",
        "-- errors on the duplicate name, which is the safe direction.",
        "",
      ].join("\n");

  const filled = databaseJobs + reports + tail;

  if (filled.includes("REPLACE-ME") || filled.includes("REPLACE-WITH")) {
    console.error("A placeholder survived — cron.sql has changed shape.");
    process.exit(1);
  }

  const header = [
    "-- GENERATED by scripts/build-cron.ts. Not committed: it can contain CRON_SECRET.",
    "--",
    "-- Paste into the Supabase SQL editor. Re-running errors on job names that",
    "-- already exist, which is the safe direction — unschedule first if you are",
    "-- changing the URL or rotating the secret:",
    "--",
    "--   select cron.unschedule('paperpath-purge');",
    "--   select cron.unschedule('paperpath-purge-comms');",
    "--   select cron.unschedule('paperpath-purge-imports');",
    "--   select cron.unschedule('paperpath-grace');",
    "--   select cron.unschedule('paperpath-reports');",
    "--",
    includeReports
      ? `-- Includes the weekly parent report, pointing at ${base}`
      : "-- Database jobs only. The weekly parent report is not scheduled.",
    "",
  ].join("\n");

  const out = resolve(ROOT, "supabase/cron.generated.sql");
  writeFileSync(out, header + filled, "utf8");

  const ignorePath = resolve(ROOT, ".gitignore");
  const ignore = readFileSync(ignorePath, "utf8");

  if (!ignore.includes("cron.generated.sql")) {
    appendFileSync(
      ignorePath,
      "\n# Can hold CRON_SECRET. Generated by npm run db:cron.\nsupabase/cron.generated.sql\n",
    );
  }

  console.log("");
  console.log(`supabase/cron.generated.sql — ${includeReports ? "5 jobs" : "4 jobs"}`);
  console.log("  purge_expired_data, purge_comms, purge_import_errors, expire_grace");
  if (includeReports) console.log("  and the weekly parent report");
  console.log("");
  console.log("Paste it into the Supabase SQL editor. Then check it took:");
  console.log("  select jobname, schedule, active from cron.job;");
}

await main();
