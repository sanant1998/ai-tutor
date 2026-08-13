/* Deletes the storage objects that purge_expired_data() cannot reach.
 *
 *   node --import ./scripts/register-alias.mjs scripts/purge-storage.ts
 *   node --import ./scripts/register-alias.mjs scripts/purge-storage.ts --dry
 *
 * Run daily, after the SQL purge.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS SEPARATELY
 *
 * Postgres cannot talk to object storage. purge_expired_data() deletes the
 * voice_blobs ROW at thirty days; the audio file in the bucket is untouched and
 * — worse — once the row is gone nothing points at the file any more.
 *
 * So the order matters and it is the opposite of the obvious one: this script
 * runs FIRST against rows that are about to expire, deletes their objects, and
 * only then does the SQL job remove the rows. Getting it backwards leaves
 * orphaned recordings of children's voices in a bucket with nothing to
 * identify them by, which is the single worst retention failure this product
 * could have.
 *
 * It also sweeps genuinely orphaned objects — files whose row went missing in
 * an earlier crash — because "we deleted it, mostly" is not a retention
 * policy. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

/* Matches the interval in purge_expired_data(). Kept in step by hand, and
   noted in both places, because a mismatch here deletes audio for rows that
   still exist or leaves audio for rows that do not. */
const VOICE_RETENTION_DAYS = 30;

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

/* Names the ONE that is missing, not the whole list.
 *
 * "Set A and B" when B is already set sends someone to check both, find A
 * present, and doubt whether the file is being read at all. A message that
 * names only what is absent is the difference between a five-second fix and a
 * ten-minute one. */
function missing(...names: string[]): string[] {
  return names.filter((name) => !process.env[name]);
}

function reportMissing(names: string[]): never {
  console.error("Missing from .env.local:");
  for (const name of names) console.error(`  ${name}`);

  if (names.includes("SUPABASE_SERVICE_ROLE_KEY")) {
    console.error("");
    console.error("The service-role key is in the Supabase dashboard under");
    console.error("  Project Settings -> API -> Project API keys -> service_role");
    console.error("");
    console.error("It bypasses row-level security, so: server-side only, never");
    console.error("committed, and never given a NEXT_PUBLIC_ prefix.");
  }

  process.exit(1);
}

async function main() {
  const dry = process.argv.includes("--dry");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const absent = missing("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
  if (absent.length > 0) reportMissing(absent);

  const db = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cutoff = new Date(Date.now() - VOICE_RETENTION_DAYS * 86400000).toISOString();

  /* --- Expiring rows ---------------------------------------------------- */
  const { data: expiring, error } = await db
    .from("voice_blobs")
    .select("id, storage_path, created_at")
    .lt("created_at", cutoff)
    .neq("storage_path", "");

  if (error) {
    console.error(`Could not read voice_blobs: ${error.message}`);
    process.exit(1);
  }

  const paths = (expiring ?? []).map((row) => row.storage_path as string).filter(Boolean);

  console.log(
    `${paths.length} recording${paths.length === 1 ? "" : "s"} older than ${VOICE_RETENTION_DAYS} days.`,
  );

  if (paths.length > 0 && !dry) {
    /* Supabase caps a remove() call; batching keeps a big backlog from
       silently truncating. */
    for (let index = 0; index < paths.length; index += 100) {
      const batch = paths.slice(index, index + 100);
      const { error: removeError } = await db.storage.from("voice-notes").remove(batch);

      if (removeError) {
        console.error(`  remove failed: ${removeError.message}`);
        /* Do NOT clear storage_path when the delete failed — the pointer is
           the only thing that will let a retry find the file. */
        continue;
      }

      /* Blank the path so a re-run does not try again, while leaving the row
         for the SQL job to delete. The transcript stays useful until then. */
      await db
        .from("voice_blobs")
        .update({ storage_path: "" })
        .in(
          "id",
          (expiring ?? [])
            .filter((row) => batch.includes(row.storage_path as string))
            .map((row) => row.id as string),
        );

      console.log(`  removed ${batch.length}`);
    }
  }

  /* --- Orphans ----------------------------------------------------------
     Files with no row at all. These come from a crash between the upload and
     the insert, and nothing else will ever delete them. */
  const { data: folders } = await db.storage.from("voice-notes").list("", { limit: 1000 });

  let orphans = 0;

  for (const folder of folders ?? []) {
    const { data: files } = await db.storage
      .from("voice-notes")
      .list(folder.name, { limit: 1000 });

    for (const file of files ?? []) {
      const path = `${folder.name}/${file.name}`;

      const { count } = await db
        .from("voice_blobs")
        .select("id", { count: "exact", head: true })
        .eq("storage_path", path);

      if ((count ?? 0) > 0) continue;

      /* A grace window, because a file uploaded seconds ago may have a row
         still in flight. */
      const age = Date.now() - new Date(file.created_at ?? Date.now()).getTime();
      if (age < 3600_000) continue;

      orphans += 1;
      if (!dry) await db.storage.from("voice-notes").remove([path]);
    }
  }

  console.log(`${orphans} orphaned object${orphans === 1 ? "" : "s"}${dry ? " (dry run)" : " removed"}.`);
  console.log("\nRun supabase's purge_expired_data() after this, not before.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
