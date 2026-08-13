import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/* False until the project is pointed at a Supabase instance. The auth forms
   check this so an unconfigured deploy shows a clear message instead of
   failing inside the SDK. */
export const isSupabaseConfigured = Boolean(url && anonKey);

export function createClient() {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return createBrowserClient(url, anonKey);
}
