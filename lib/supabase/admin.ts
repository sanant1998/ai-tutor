/* The service-role client.

   Bypasses row-level security completely, so it exists for exactly the jobs
   RLS cannot express:

     - reading bank_questions, whose answers no student may ever select;
     - writing safety_flags, which no student may read or write;
     - writing llm_calls and consents, which are records ABOUT a student rather
       than records BELONGING to one;
     - the weekly parent report, which reads a student's rows to send a
       summary to the phone on their consent row. A parent has no account, so
       there is no session to read them under.

   Everything else uses lib/supabase/server.ts and stays inside RLS. The rule
   worth keeping: a route reaches for this client when it needs to do something
   the signed-in user is not allowed to do, and it must then do that one thing
   and no more. Passing a user id straight from a request body into a query on
   this client is how an app grows an "any student, any data" endpoint without
   anyone deciding to build one. */

import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function isAdminConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. The tutor cannot read the question bank without it.",
    );
  }

  cached = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}
