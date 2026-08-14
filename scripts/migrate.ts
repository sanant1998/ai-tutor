/* Applies the pending migrations. Runs automatically before `next dev`.
 *
 *   npm run db:migrate
 *
 * ---------------------------------------------------------------------------
 * WHAT IT REPLACES
 *
 * `npm run db:bundle` and a paste into the Supabase SQL editor. That still
 * works and is still the right thing for a deploy somebody is watching; this
 * is for the case where a migration landed in a branch and the next person to
 * run the dev server has no idea it exists. The symptom of missing it is never
 * an error that names the cause — the admin console quietly showed only the
 * three Indian boards for exactly this reason.
 *
 * ---------------------------------------------------------------------------
 * A FILE RE-RUNS WHEN IT CHANGES
 *
 * Not "applied once, done for ever". These migrations are edited in place —
 * see the note in migration-order.ts — and every one is written to be
 * re-runnable. So the record is a CHECKSUM, not a tick: a file whose contents
 * differ from what was last applied is applied again, which is precisely what
 * a person would do by pasting it into the SQL editor a second time.
 *
 * ---------------------------------------------------------------------------
 * IT BASELINES RATHER THAN REPLAYING
 *
 * On a database that already has the schema — which is every database this
 * project currently has — the first run records the current checksums WITHOUT
 * executing anything. Replaying four thousand lines of DDL against a live
 * project to arrive at the state it is already in is a lot of risk for no
 * change. After that, only genuinely new or edited files run.
 *
 * ---------------------------------------------------------------------------
 * IT POINTS AT WHATEVER DATABASE_URL POINTS AT
 *
 * Which, for this project, is production — there is no local container. That
 * is worth being awake to: a mistake in a migration reaches real data the
 * moment somebody starts the dev server, with no review step in between. The
 * guards here are that each file runs inside a transaction and rolls back
 * whole on failure, that nothing runs unless its contents actually changed,
 * and that a failure stops `next dev` rather than letting the app boot against
 * a half-migrated schema. None of that is a substitute for reading the diff.
 *
 * Set SKIP_MIGRATIONS=1 to start the dev server without any of this. */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import { ORDER } from "./migration-order.ts";

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

/* A table, not a file of applied names: two people on two machines share one
   database, and a local file would let each of them believe a different thing
   about it. */
const LEDGER = `
  create table if not exists public.schema_migrations (
    filename    text primary key,
    checksum    text not null,
    applied_at  timestamptz not null default now()
  )
`;

/* Any table the app cannot run without. Its presence is what distinguishes
   "empty database, run everything" from "existing database, baseline it". */
const SENTINEL = "public.profiles";

function checksum(body: string) {
  return createHash("sha256").update(body).digest("hex").slice(0, 16);
}

async function main() {
  if (process.env.SKIP_MIGRATIONS === "1") {
    console.log("migrations: skipped (SKIP_MIGRATIONS=1)");
    return;
  }

  const url = process.env.DATABASE_URL;

  /* Absent is not an error. Most of what this repo does needs no database
     connection string, and breaking `npm run dev` for everybody who has not
     set one would be a worse trade than the missed migration it prevents. It
     says so once and gets out of the way. */
  if (!url) {
    console.log(
      "migrations: skipped — DATABASE_URL is not set in .env.local.\n" +
        "            Supabase dashboard → Project Settings → Database → Connection string → URI.\n" +
        "            Use the session pooler or the direct connection, not the transaction\n" +
        "            pooler on 6543: it cannot run the DDL in these files.",
    );
    return;
  }

  const files = ORDER.map(({ file }) => ({
    file,
    body: readFileSync(resolve(ROOT, "supabase", file), "utf8"),
  })).map((entry) => ({ ...entry, sum: checksum(entry.body) }));

  const db = new Client({
    connectionString: url,
    /* Supabase terminates TLS with a certificate this client has no root for.
       The connection is still encrypted; what is skipped is verifying the
       chain, which is the same posture psql uses against Supabase by default. */
    ssl: { rejectUnauthorized: false },
    /* Rather than hanging on a network that silently drops the packets, which
       is what an IPv4-only machine does against a direct (IPv6) connection. */
    connectionTimeoutMillis: 10_000,
  });

  /* Not being able to REACH the database is not the same failure as a
   * migration that ran and broke, and it must not be treated like one.
   *
   * You can be on a plane, on a VPN, behind an IPv4-only network with a direct
   * connection string, or one character out in a pasted password. None of that
   * is a reason to refuse to start the dev server — most of this app's screens
   * render without a database, and the ones that do not already fail with
   * their own clear errors. Blocking `next dev` here would mean a wrong
   * password stops you writing CSS.
   *
   * A migration that executes and fails is the opposite case, and is still
   * fatal below: the schema is then in a state no file describes, and letting
   * the app boot against it produces bugs that look like application bugs. */
  try {
    await db.connect();
  } catch (error) {
    console.log(
      `migrations: skipped — could not connect (${(error as Error).message.trim()})\n` +
        "            Check DATABASE_URL in .env.local. If it is the direct connection\n" +
        "            (db.<ref>.supabase.co) it needs IPv6 — use the session pooler instead.\n" +
        "            Percent-encode any @ # ? % in the password.",
    );
    return;
  }

  try {
    await db.query(LEDGER);

    const applied = new Map<string, string>();
    for (const row of (await db.query("select filename, checksum from public.schema_migrations")).rows) {
      applied.set(row.filename, row.checksum);
    }

    /* Nothing recorded, but the schema is there: this database was migrated by
       hand before this script existed. Record where it stands rather than
       replaying it. */
    if (applied.size === 0) {
      const { rows } = await db.query("select to_regclass($1) as found", [SENTINEL]);

      if (rows[0].found) {
        for (const { file, sum } of files) {
          await db.query(
            "insert into public.schema_migrations (filename, checksum) values ($1, $2)" +
              " on conflict (filename) do update set checksum = excluded.checksum",
            [file, sum],
          );
        }

        console.log(
          `migrations: baselined ${files.length} files against the existing schema — none were run.`,
        );
        return;
      }
    }

    const pending = files.filter(({ file, sum }) => applied.get(file) !== sum);

    if (pending.length === 0) {
      console.log(`migrations: up to date (${files.length} applied)`);
      return;
    }

    for (const { file, body, sum } of pending) {
      const verb = applied.has(file) ? "changed" : "new";
      process.stdout.write(`migrations: ${file} (${verb}) … `);

      /* One transaction per file. A migration that fails halfway leaves the
         database as it was rather than in a state no file describes. */
      await db.query("begin");
      try {
        await db.query(body);
        await db.query(
          "insert into public.schema_migrations (filename, checksum) values ($1, $2)" +
            " on conflict (filename) do update set checksum = excluded.checksum, applied_at = now()",
          [file, sum],
        );
        await db.query("commit");
        console.log("ok");
      } catch (error) {
        await db.query("rollback");
        console.log("failed");
        throw new Error(`${file}: ${(error as Error).message}`);
      }
    }

    console.log(`migrations: applied ${pending.length}`);
  } finally {
    await db.end();
  }
}

main().catch((error: Error) => {
  console.error(`\nmigrations: ${error.message}\n`);
  console.error("The database was rolled back to its state before that file.");
  console.error("Fix the migration, or start without it: SKIP_MIGRATIONS=1 npm run dev\n");
  process.exit(1);
});
