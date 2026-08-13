/* The built-in event collector.
 *
 * lib/analytics/events.ts posts here when NEXT_PUBLIC_ANALYTICS_URL is unset,
 * which is the default. Point that variable elsewhere and this route stops
 * being used — it exists so that an unconfigured deployment can still answer
 * "is the tutor working", rather than emitting events into a console nobody
 * is reading.
 *
 * ---------------------------------------------------------------------------
 * THIS ENDPOINT IS PUBLIC AND MUST STAY CHEAP TO ABUSE
 *
 * sendBeacon cannot carry credentials reliably and fires as the page closes,
 * so requiring a session here would drop exactly the events worth having.
 * Instead the route accepts anything and defends by being boring: it stores
 * only names from a fixed list, drops properties that look like free text, and
 * never trusts a user id from the body.
 *
 * The worst an attacker achieves is inflating a counter on an internal
 * dashboard. That is worth accepting to keep the health numbers honest. */

import { NextResponse } from "next/server";

import { callerIp, takeLimit } from "@/lib/ratelimit";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/* Only names the app actually emits. An unknown name is dropped rather than
   stored: without this the table becomes whatever anyone posts at it, and the
   dashboard queries stop meaning anything. */
const KNOWN = new Set([
  "session_started",
  "beat_advanced",
  "reteach_entered",
  "downshift_triggered",
  "session_completed",
  "session_abandoned",
  "question_attempted",
  "misconception_detected",
  "mastery_achieved",
  "topic_unlocked",
  "paywall_viewed",
  "checkout_started",
  "subscription_activated",
  "mandate_failed",
  "subscription_cancelled",
  "parent_link_requested",
  "parent_link_confirmed",
  "parent_report_sent",
  "parent_report_opened",
  "consent_granted",
  "consent_withdrawn",
  "verdict_parse_failed",
  "output_check_failed",
  "provider_fell_back",
  "safety_intervention",
]);

/* Same rule as lib/analytics/events.ts, enforced again at the boundary. The
   client-side check is a development aid; this one is the guarantee. */
const FORBIDDEN = /message|content|answer|text|name|phone|email|transcript|excerpt/i;

export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    /* Nothing to write to. 204 rather than an error: a beacon has nobody to
       report a failure to, and a red line in a browser console for a
       deployment without a database is noise. */
    return new NextResponse(null, { status: 204 });
  }

  const limit = await takeLimit("practice_attempt", callerIp(request));
  if (!limit.allowed) return new NextResponse(null, { status: 204 });

  let body: { event?: string; properties?: Record<string, unknown>; at?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const event = String(body.event ?? "");
  if (!KNOWN.has(event)) return new NextResponse(null, { status: 204 });

  const properties: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body.properties ?? {})) {
    if (FORBIDDEN.test(key)) continue;
    /* Scalars only. A nested object is somewhere free text hides from the
       check above. */
    if (typeof value === "object" && value !== null) continue;
    if (typeof value === "string" && value.length > 120) continue;
    properties[key] = value;
  }

  /* No identity, ever. Not from the body, and — since this route stopped
     reading the session cookie — not from there either.
   *
   * The old version took the user id off the session and stored it without
   * ever consulting the consent list, so a parent who declined the analytics
   * purpose had their child's events written anyway. That is what removed the
   * purpose from the consent screen: the fix was to stop collecting the id,
   * not to add a check. Nothing read the column, so nothing lost anything.
   *
   * An event here is now "this happened, once", which is all the health
   * dashboard ever counted. */
  try {
    await createAdminClient().from("analytics_events").insert({
      event,
      properties,
      /* The client stamps the time it happened; a beacon can arrive minutes
         later from a queue and the difference matters for latency numbers. */
      at: body.at && !Number.isNaN(Date.parse(body.at)) ? body.at : new Date().toISOString(),
    });
  } catch {
    /* Analytics must never be able to break anything. */
  }

  return new NextResponse(null, { status: 204 });
}
