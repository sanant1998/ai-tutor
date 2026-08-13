/* Emitting an event from the server.
 *
 * ---------------------------------------------------------------------------
 * NOTHING HERE IDENTIFIES A STUDENT, SO NOTHING HERE NEEDS CONSENT
 *
 * This file used to attach a user id to behavioural events, gate them on an
 * optional 'analytics' consent, and cache that consent for a minute. All of
 * that is gone, and the reason is worth writing down because the old shape
 * looked more careful than it was.
 *
 * Nothing ever read analytics_events.user_id. Not health_snapshot, which
 * counts distinct students from learning_sessions; not activation_by_cohort,
 * which works off auth.users and topic_mastery. The column was written on
 * every event and consumed by no query — a child's identity collected for a
 * purpose that did not exist.
 *
 * And the browser collector at /api/analytics never checked the consent at
 * all. It took the id off the session cookie and wrote it whether the parent
 * had agreed or not, so the box on the consent screen was asking permission
 * for something that happened regardless.
 *
 * The fix is not a better gate. It is to stop collecting the identity: what
 * remains is a count of how often each event happened, which is what the
 * numbers were computed from all along. That makes the events non-personal,
 * which is why the 'analytics' purpose no longer appears on the consent
 * screen — the honest way to remove a consent box is to remove the processing
 * it was asking about, not the box.
 *
 * Usage data is a super-admin concern now: it is on /admin/health, and it says
 * nothing about any individual child. */

import "server-only";

import { track, type AnalyticsEvent } from "@/lib/analytics/events";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

/* Kept for the call sites that read as "this happened to a student", so the
   intent at the call site stays legible. The id is deliberately accepted and
   deliberately dropped: taking it and ignoring it is what makes an accidental
   re-introduction of identified analytics a change to this file, where the
   reasoning above is, rather than a change at a call site where it is not. */
export async function trackFor(_userId: string, event: AnalyticsEvent) {
  write(event);
}

export function trackSystem(event: AnalyticsEvent) {
  write(event);
}

/* Straight into the table.
 *
 * The client path posts to /api/analytics because a browser cannot reach the
 * database. The server is already holding an admin client, so a round trip
 * through its own HTTP endpoint would be a request to itself — slower, and one
 * more thing to fail during a tutor turn.
 *
 * `track` is still called first so the development console shows the event and
 * the forbidden-property check runs, which is where a bad property name is
 * caught while someone is looking at it. */
function write(event: AnalyticsEvent) {
  track(event);

  if (!isAdminConfigured()) return;

  const { name, ...properties } = event;

  void createAdminClient()
    .from("analytics_events")
    .insert({ event: name, properties })
    .then(
      () => undefined,
      () => {
        /* Never able to break a lesson. */
      },
    );
}
