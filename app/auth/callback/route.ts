import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/* Exchanges the OAuth / email-confirmation code for a session cookie, then
   forwards the visitor on. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  /* The age gate, not onboarding. It forwards to /onboarding by itself once
     it knows who this account belongs to — and sending a teacher straight into
     a student's five-step revision setup was the old behaviour. */
  const next = searchParams.get("next") ?? "/parent-consent";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
