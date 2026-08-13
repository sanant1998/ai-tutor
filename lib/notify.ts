/* The in-app bell.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS NOT
 *
 * It is not lib/messaging/send.ts. That one sends WhatsApp to a
 * consent-verified number and is governed by every rule in compliance.sql,
 * because it reaches a person who did not open the app and may not have agreed
 * to hear from it.
 *
 * This writes a row a signed-in person sees when they next open a screen they
 * were going to open anyway. No consent question, no cost, no delivery
 * failure — and correspondingly, no guarantee anyone reads it.
 *
 * ---------------------------------------------------------------------------
 * IT NEVER THROWS
 *
 * A notification is a copy of something that already happened. Failing the
 * homework that was just set because the bell row would not write is trading
 * the thing for the announcement of the thing.
 *
 * ---------------------------------------------------------------------------
 * KEEP THE BODY SHORT AND FACTUAL
 *
 * comms.sql argues this at the table: a notification that quoted what a child
 * asked the tutor would put it on a shared family phone's lock screen. Titles
 * here say what happened and where to look, and nothing else. */

import "server-only";

import { reportError } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/admin";

export type Notification = {
  orgId: string | null;
  kind: "assignment_due" | "test_result" | "test_set" | "announcement" | "licence";
  title: string;
  body?: string | null;
  /* An in-app path, never an absolute URL. A notification that can point at
     another origin is a phishing surface inside the product. */
  link?: string | null;
};

export async function notify(
  userIds: string[],
  notification: Notification,
): Promise<void> {
  const recipients = [...new Set(userIds.filter(Boolean))];
  if (recipients.length === 0) return;

  if (notification.link && !notification.link.startsWith("/")) {
    await reportError("notify", new Error("link must be an in-app path"), {
      link: notification.link,
    });
    return;
  }

  try {
    const db = createAdminClient();

    const { error } = await db.from("notifications").insert(
      recipients.map((userId) => ({
        user_id: userId,
        org_id: notification.orgId,
        kind: notification.kind,
        title: notification.title,
        body: notification.body ?? null,
        link: notification.link ?? null,
      })),
    );

    if (error) throw new Error(error.message);
  } catch (error) {
    await reportError("notify", error, { kind: notification.kind });
  }
}
