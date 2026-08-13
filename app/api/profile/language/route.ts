/* The student's teaching language.
 *
 * Its own tiny route rather than part of a general profile update: this is the
 * only profile field a student may change about how the tutor behaves, and a
 * general "update my profile" endpoint is where `is_minor`, `account_state`
 * and `role` eventually become writable by accident. */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { DEFAULT_LANGUAGE, isLanguage, LANGUAGES } from "@/lib/language";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) {
    return NextResponse.json({ language: DEFAULT_LANGUAGE, options: LANGUAGES });
  }

  const { data } = await createAdminClient()
    .from("profiles")
    .select("language")
    .eq("id", user.value)
    .maybeSingle();

  return NextResponse.json({
    language: (data?.language as string) || DEFAULT_LANGUAGE,
    options: LANGUAGES,
  });
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) return fail("Not configured.", 503);

  let body: { language?: string };
  try {
    body = (await request.json()) as { language?: string };
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const language = String(body.language ?? "");

  /* Checked against the list rather than stored as given. The column has no
     constraint, and an unknown value would silently fall back to Hinglish at
     read time — which looks like the picker not working. */
  if (!isLanguage(language)) return fail("That language is not available.", 400);

  const { error } = await createAdminClient()
    .from("profiles")
    .update({ language })
    .eq("id", user.value);

  if (error) return fail("That could not be saved.", 500);

  /* Takes effect on the next turn, not the current one: a session in flight
     keeps the language it started in, because switching mid-conversation reads
     as the tutor losing the thread. */
  return NextResponse.json({ language, note: "This takes effect from the next session." });
}
