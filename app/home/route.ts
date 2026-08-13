/* "Take me wherever I belong."
 *
 * Sign-in cannot know where to send somebody without knowing their role, and
 * the role is a database read. Doing that read in the login form means the
 * browser learns the role before the server has finished deciding anything,
 * and doing it in three places — the password form, the OAuth callback, the
 * consent screen — means three chances to disagree.
 *
 * So all three send people here, and here is the only place that answers.
 * Before this they all sent everybody to /dashboard, which for a teacher is a
 * page of revision homework with their own name on it.
 *
 * A redirect rather than a page: nothing renders, so there is no flash of the
 * wrong shell on the way through. */

import { NextResponse } from "next/server";

import { isAllowlistedEmail } from "@/lib/admin/guard";
import { homeFor, roleFrom } from "@/lib/roles";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    /* Supabase is not configured — a keyless preview. The student shell is the
       one that degrades to something browsable. */
    return NextResponse.redirect(`${origin}${homeFor("student")}`);
  }

  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return NextResponse.redirect(`${origin}/login?next=%2Fhome`);
  }

  /* The stored half of the role. Read with the service key rather than the
     user's client because `profiles` is locked down to the three columns a
     student may edit, and `role` is deliberately not among them. */
  let stored: string | null = null;

  if (isAdminConfigured()) {
    const { data } = await createAdminClient()
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();

    stored = (data?.role as string | null) ?? null;
  }

  const role = roleFrom({
    stored,
    isSuperAdmin: isAllowlistedEmail(auth.user.email),
  });

  return NextResponse.redirect(`${origin}${homeFor(role)}`);
}
