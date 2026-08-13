import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/* Ask before creating, on the server.
 *
 * lib/supabase/client.ts has a `isSupabaseConfigured` const for the browser,
 * where the values are inlined at build time. On the server they are read per
 * request, so this is a function.
 *
 * Every page that calls createClient() below must call this first. Two of them
 * did not — /teacher and /privacy — and a keyless deploy answered both with a
 * 500 instead of the "not configured yet" panel every other screen shows. The
 * CI smoke job exists to catch exactly that and was reporting it; nothing had
 * gone back to read it. */
export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* Called from a Server Component, where cookies are read-only.
             The middleware refreshes the session instead, so this is safe
             to ignore. */
        }
      },
    },
  });
}
