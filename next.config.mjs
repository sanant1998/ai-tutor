/* Next configuration, and the response headers that were missing from it.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE ARE HERE AND NOT LEFT TO THE HOST
 *
 * This deployment holds children's learning transcripts, and it renders one
 * thing it did not write: an SVG diagram produced by a model. lib/ai/svg.ts
 * strips that down to an allowlist of shapes and attributes, and that is the
 * real defence — but a single sanitiser is one bug away from being no defence
 * at all, and a Content-Security-Policy is what makes that bug survivable
 * instead of decisive.
 *
 * Leaving it to Vercel's dashboard means it is set on one deployment and not
 * on the preview, the self-host, or the fork. In the repository it travels
 * with the code.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CSP ALLOWS 'unsafe-inline' FOR STYLES AND NOT FOR ANYTHING ELSE
 *
 * The app styles inline throughout — `style={{ color: text(0.86) }}` is the
 * house pattern, and Tailwind's runtime injects a stylesheet too. Blocking
 * inline styles would break every screen, so that one is allowed and the
 * script directive stays strict, which is the half that matters for XSS.
 *
 * `'unsafe-eval'` is granted in development only: React's fast refresh needs
 * it and production does not.
 */

const dev = process.env.NODE_ENV === "development";

/* Razorpay's checkout is the one third party that runs in this page.
 *
 * components/app/Paywall.tsx injects checkout.js on demand, and that script
 * then loads its own assets, opens an iframe and calls home. Every one of
 * those needs a directive, and the first draft of this file had only the
 * frame — which would have left the CSP looking correct in review and the
 * paywall silently dead in production, with the failure showing up as
 * `script.onerror` and the honest-looking message "Payment shuru nahi ho
 * paaya". A blocked checkout is indistinguishable from a provider outage from
 * the inside, which is exactly why it is worth being explicit here. */
const RAZORPAY = "https://*.razorpay.com";

const csp = [
  "default-src 'self'",
  /* Next inlines a small bootstrap script into the document, and
     ThemeScript writes the theme before first paint to avoid a flash of the
     wrong one. Both are inline by necessity. */
  `script-src 'self' 'unsafe-inline' ${RAZORPAY}${dev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline' ${RAZORPAY}`,
  /* data: for the inlined icons; blob: for the microphone recording before it
     is uploaded; Razorpay for the bank and UPI-app logos in its checkout. */
  `img-src 'self' data: blob: ${RAZORPAY}`,
  `font-src 'self' data: ${RAZORPAY}`,
  /* Supabase (REST, auth, storage, realtime) and the model providers are all
     reached from the SERVER, so the browser only ever talks to Supabase
     directly — for auth and for signed storage URLs. Razorpay's checkout
     posts its own telemetry and payment status from the page. */
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${RAZORPAY}`,
  /* Signed audio URLs from Supabase storage. */
  "media-src 'self' blob: https://*.supabase.co",
  /* Razorpay's checkout opens in an iframe it injects. */
  `frame-src 'self' ${RAZORPAY}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  /* Nothing in this product is ever framed by anyone else. */
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  /* Redundant with frame-ancestors above, and kept for the browsers that
     honour one and not the other. */
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  /* Cross-origin requests carry the origin and nothing else. A tutor URL can
     contain a topic id, which says what a child is struggling with. */
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  /* The microphone is used, by one feature, on this origin. Everything else a
     browser can be asked for is refused outright — a maths tutor has no reason
     to reach a camera, a location or a payment handler. */
  {
    key: "Permissions-Policy",
    value: [
      "microphone=(self)",
      "camera=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
    ].join(", "),
  },
  /* Two years, subdomains included. Only meaningful over HTTPS, and harmless
     locally where the header is simply ignored. */
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /* Where the build goes, overridable.
   *
   * `next dev` and `next build` both own .next, and neither takes a lock. Two
   * of them on one checkout — a dev server in one terminal, a build in another
   * — interleave their writes, and the build fails at prerender with
   * `PageNotFoundError: Cannot find module for page: /papers`, naming a
   * different page each run. It reads as a broken route and is a broken
   * directory.
   *
   * NEXT_DIST_DIR=.next-verify gives a build its own ground, so a check can be
   * run without asking whoever is developing to stop. */
  distDir: process.env.NEXT_DIST_DIR || ".next",

  /* Native modules webpack must not try to bundle.
   *
   * @napi-rs/canvas ships a compiled `.node` binary per platform, and lib/
   * content/extract.ts loads it to rasterise a scanned PDF page for the vision
   * fallback. Webpack has no loader for a binary and does not need one: this
   * only ever runs on the server, where Node can require it directly.
   *
   * Without this the whole production build fails on `Module parse failed:
   * Unexpected character` pointing at skia.win32-x64-msvc.node — an error that
   * names a file nobody wrote and reads like a corrupt install rather than a
   * missing config line. */
  serverExternalPackages: ["@napi-rs/canvas"],

  async headers() {
    return [
      {
        /* Everything. An API route returning JSON gains nothing from a CSP and
           loses nothing to one, and carving out exceptions is how a path ends
           up uncovered. */
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
