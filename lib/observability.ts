/* Where an error goes when it is not in front of a developer.
 *
 * ---------------------------------------------------------------------------
 * NOTHING WAS CATCHING THESE
 *
 * Every failure path in the app called console.error and stopped there. On a
 * serverless host that is a line in a log nobody reads, rotated out in a week.
 * The first time anyone learned a route was 500ing was when a student said so
 * — and students do not say so, they close the tab.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT SENTRY
 *
 * Sentry would be a better product than this and a worse fit right now. Its
 * Next.js SDK adds a client bundle, wraps the build, and — by default — sends
 * breadcrumbs and session context from pages used by children, which is a
 * consent conversation nobody wants to have for a project with no users yet.
 *
 * So: an HTTP POST to whatever URL is configured, and a database row when one
 * is not. Both are vendor-neutral. Swapping in an SDK later is one function.
 *
 * ---------------------------------------------------------------------------
 * WHAT NEVER GOES IN A REPORT
 *
 * A student's message, an answer, a name, a phone number, or the excerpt from a
 * safety flag. Errors are the place personal data leaks by accident, because
 * whoever writes the catch block is thinking about the bug and not about who is
 * in the variable they are attaching. So `context` takes ids and short labels,
 * and anything long or free-text-shaped is dropped before it is sent. */

import "server-only";

import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export type ErrorContext = Record<string, string | number | boolean | null | undefined>;

/* Same rule as the analytics taxonomy, enforced again here because a catch
   block is exactly where someone attaches `{ message }` without thinking. */
const FORBIDDEN = /message|content|answer|text|name|phone|email|transcript|excerpt|body|prompt/i;

/* Reports the error and never throws.
 *
 * Every call site is already inside a failure path. An error reporter that can
 * itself fail turns a handled 502 into an unhandled 500, which is the one thing
 * it must not do. */
export async function reportError(
  where: string,
  error: unknown,
  context: ErrorContext = {},
): Promise<void> {
  const detail = {
    where,
    kind: error instanceof Error ? error.name : typeof error,
    /* An Error's own message is ours, not a student's — it comes from a throw
       in our code or a provider's SDK. The FORBIDDEN filter applies to the
       CONTEXT, which is where someone would attach a student's words. */
    message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    stack:
      error instanceof Error && error.stack
        ? error.stack.split("\n").slice(0, 8).join("\n")
        : null,
    context: clean(context),
    at: new Date().toISOString(),
    env: process.env.NODE_ENV,
  };

  /* Always. A structured line beats an unstructured one even when nothing is
     collecting them, and in development this is the whole mechanism. */
  console.error(`[error] ${where}`, detail.message, detail.context);

  const endpoint = process.env.ERROR_REPORT_URL;

  if (endpoint) {
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(detail),
        signal: AbortSignal.timeout(3000),
      });
      return;
    } catch {
      /* Fall through to the database. A reporter that loses the error because
         the reporting service is down is the least useful possible design. */
    }
  }

  if (!isAdminConfigured()) return;

  try {
    await createAdminClient().from("error_reports").insert({
      /* where_ , not where: the latter is a reserved word in SQL and PostgREST
         maps column names straight through. */
      where_: where,
      kind: detail.kind,
      message: detail.message,
      stack: detail.stack,
      context: detail.context,
    });
  } catch {
    /* Nothing left to try, and the console line above already happened. */
  }
}

function clean(context: ErrorContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    if (FORBIDDEN.test(key)) continue;
    if (value === undefined) continue;
    /* Long strings are free text wearing a short key. */
    if (typeof value === "string" && value.length > 120) continue;
    out[key] = value;
  }

  return out;
}

/* Wraps a route handler so an unhandled throw is reported rather than becoming
   an opaque 500. Used on the routes where a silent failure is most expensive:
   the tutor turn, the webhook, the cron. */
export function reported<T extends unknown[], R>(
  where: string,
  handler: (...args: T) => Promise<R>,
): (...args: T) => Promise<R> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (error) {
      await reportError(where, error);
      throw error;
    }
  };
}
