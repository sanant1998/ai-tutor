"use client";

/* Registers public/sw.js, and only where it is safe to.
 *
 * Registration is deferred to after load. A service worker registering during
 * the first paint competes with the page for the same connection, on the
 * connection this audience has least of — the offline shell is worth having
 * and it is not worth a slower first screen to get it.
 *
 * In development it does the opposite: it unregisters anything already there.
 * A stale service worker serving yesterday's chunks is one of the more
 * confusing local failures available, and it survives a hard refresh. */

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .catch(() => undefined);
      return;
    }

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Blocked by a policy, or private browsing. The app works without it. */
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
