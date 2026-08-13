/* The service worker.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES AND, MORE IMPORTANTLY, WHAT IT REFUSES TO DO
 *
 * It caches the app shell so a student on a dropped 4G cell sees a page rather
 * than the browser's dinosaur, and it serves an offline notice for navigations
 * it cannot fulfil.
 *
 * It caches NOTHING from /api. Not the tutor stream, not a practice question,
 * not a session. Three reasons, and the first two are the serious ones:
 *
 *   - A cached practice question is a cached ANSWER a moment later. The whole
 *     design keeps answers off the device; a well-meaning cache-first rule
 *     would undo that in one line.
 *
 *   - Cached responses belonging to one signed-in student can be served to the
 *     next person who opens the browser on a shared family phone. Shared
 *     devices are the norm in this market, not an edge case.
 *
 *   - Streaming responses cannot be cached usefully anyway.
 *
 * So: static assets and the shell, and nothing that knows who you are.
 *
 * Registered by components/ServiceWorker.tsx. Bump CACHE when the shell
 * changes; the old cache is deleted on activate. */

const CACHE = "paperpath-shell-v1";

/* Kept deliberately short. Next.js hashes its own asset filenames, so those
   are cached on demand below rather than listed here — a hard-coded list of
   hashed chunks is stale the moment anything is rebuilt. */
const SHELL = ["/offline", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      /* One missing file must not stop the worker installing — it would leave
         the student with no offline behaviour at all rather than a partial
         one. */
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  /* Same origin only, and never the API. See the note at the top — this is the
     line that keeps answers and one student's session off a shared phone. */
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/auth/")) return;

  /* Navigations: network first, because a stale page in this app means stale
     progress, and fall back to the cache only when the network genuinely
     fails. */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline").then((cached) => cached ?? offlineResponse()),
      ),
    );
    return;
  }

  /* Static assets: cache first. Next hashes these filenames, so a cached one is
     never the wrong version. */
  if (
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            /* Only cache a real success. Caching a 404 or an opaque redirect
               makes it permanent. */
            if (response.ok && response.type === "basic") {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

function offlineResponse() {
  return new Response(
    "<!doctype html><meta charset=utf-8><title>Offline</title>" +
      "<style>body{font-family:system-ui;padding:3rem 1.5rem;max-width:32rem;margin:0 auto}</style>" +
      "<h1>Internet nahi hai</h1>" +
      "<p>Connection wapas aate hi ye page khul jaayega. Jo padha hai wo saara safe hai.</p>",
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
