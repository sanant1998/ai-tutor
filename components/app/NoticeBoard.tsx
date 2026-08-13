"use client";

/* School notices, on the screen the student already opens.
 *
 * Not a bell, not a badge, not a separate page. A notice a school sends is
 * read on the day it is sent or not at all, and a page nobody navigates to is
 * where notices go to be missed. So it sits at the top of today's plan, shows
 * what is live right now, and disappears when there is nothing — an empty
 * panel saying "no announcements" is a permanent piece of furniture that
 * teaches people to ignore that part of the screen.
 *
 * Which notices arrive is the database's decision, not this component's: the
 * policy on announcements filters by org, section, publish date and expiry.
 * There is no filtering here to disagree with it. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Megaphone, X } from "lucide-react";

import { text } from "@/lib/theme";

type Notice = {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
};

/* The bell, which is a different thing from a notice board and sits above it.
   An announcement is the school talking to everyone; a notification is
   something that happened to THIS student — their homework was marked, a test
   was set for their class. Personal first, because that is the one with
   something to do attached. */
type Alert = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
};

export function NoticeBoard() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const dismiss = async (id: string) => {
    /* Removed from the screen first. The row is already read as far as the
       student is concerned, and a dismiss that waits for a round trip on a
       slow connection gets tapped twice. */
    setAlerts((current) => current.filter((alert) => alert.id !== id));

    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch {
      /* It stays unread and comes back tomorrow. Harmless. */
    }
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [notices, alerts] = await Promise.all([
          fetch("/api/announcements"),
          fetch("/api/notifications"),
        ]);

        if (alerts.ok) {
          const payload = (await alerts.json()) as { notifications: Alert[] };
          if (!cancelled) setAlerts(payload.notifications.slice(0, 4));
        }

        if (!notices.ok) return;

        const payload = (await notices.json()) as { announcements: Notice[] };
        if (!cancelled) setNotices(payload.announcements.slice(0, 3));
      } catch {
        /* Offline, or comms.sql has not run. The dashboard is not about
           notices and must not fail for the want of them. */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (notices.length === 0 && alerts.length === 0) return null;

  return (
    <section aria-label="School notices" className="space-y-2">
      {alerts.map((alert) => {
        const inner = (
          <>
            <p className="flex items-center gap-2 text-[14px] font-bold" style={{ color: text(0.9) }}>
              <Bell className="h-3.5 w-3.5 shrink-0 opacity-60" />
              {alert.title}
            </p>
            {alert.body && (
              <p className="mt-1 text-[13.5px] leading-[1.5]" style={{ color: text(0.62) }}>
                {alert.body}
              </p>
            )}
          </>
        );

        return (
          <div
            key={alert.id}
            className="flex items-start gap-3 rounded-2xl px-4 py-3"
            style={{ background: text(0.05), border: `1px solid ${text(0.12)}` }}
          >
            <div className="min-w-0 flex-1">
              {alert.link ? (
                <Link href={alert.link} onClick={() => void dismiss(alert.id)}>
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </div>

            <button
              type="button"
              onClick={() => void dismiss(alert.id)}
              aria-label="Hata dein"
              className="shrink-0 rounded-lg p-1"
              style={{ color: text(0.4) }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}

      {notices.map((notice) => (
        <article
          key={notice.id}
          className="rounded-2xl px-4 py-3"
          style={{ background: text(0.04), border: `1px solid ${text(0.1)}` }}
        >
          <p className="flex items-center gap-2 text-[14px] font-bold" style={{ color: text(0.9) }}>
            <Megaphone className="h-3.5 w-3.5 shrink-0 opacity-60" />
            {notice.title}
          </p>
          <p className="mt-1 text-[13.5px] leading-[1.5]" style={{ color: text(0.62) }}>
            {notice.body}
          </p>
        </article>
      ))}
    </section>
  );
}
