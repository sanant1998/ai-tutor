/* Shared plumbing for the AI routes: who is asking, what they asked for, and
   how failures come back.

   Generation costs money on every call, so these routes are signed-in only.
   A signed-out visitor can still browse the app on local data — they just
   cannot spend tokens. */

import "server-only";

import { NextResponse } from "next/server";

import { AiError } from "@/lib/ai/client";
import { resolveScope, type Scope, type ScopeRequest } from "@/lib/ai/scope";
import { createClient } from "@/lib/supabase/server";

export type Handled<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

export function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/* Resolves the caller. Returns a 401 response when there is no session, and a
   503 when Supabase is not configured at all — those are different problems
   and deserve different messages. */
export async function requireUser(): Promise<Handled<string>> {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return {
      ok: false,
      response: fail("Accounts are not configured on this deployment.", 503),
    };
  }

  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return { ok: false, response: fail("Sign in to generate.", 401) };
  }

  return { ok: true, value: data.user.id };
}

export async function readScope(
  request: Request,
  options?: { requireTopic?: boolean },
): Promise<Handled<{ body: Record<string, unknown>; scope: Scope }>> {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, response: fail("Expected a JSON body.", 400) };
  }

  const scope = resolveScope(body as ScopeRequest, options);

  if (!scope) {
    return {
      ok: false,
      response: fail(
        "That board, subject, unit or topic is not one we cover.",
        400,
      ),
    };
  }

  return { ok: true, value: { body, scope } };
}

/* Turns an AiError into its own status and anything else into a 500, so a
   rate limit or a missing key reaches the student as something they can
   understand rather than "something went wrong". */
export function aiFailure(error: unknown) {
  if (error instanceof AiError) {
    const message =
      error.status === 429
        ? "The AI is rate limited right now — try again in a moment."
        : error.status === 503
          ? "AI generation is not configured on this deployment yet."
          : error.message;

    return fail(message, error.status);
  }

  return fail("Generation failed. Try again.", 500);
}
