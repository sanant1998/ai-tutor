/* Route-level smoke tests, against a real server, with no credentials.
 *
 *   npm run build && npm start &
 *   npm run smoke
 *
 *   npm run smoke -- --url https://staging.example.com
 *
 * ---------------------------------------------------------------------------
 * WHY KEYLESS IS THE POINT, NOT A LIMITATION
 *
 * There were no integration tests at all before this: 42 unit tests over pure
 * functions, and nothing that had ever asked the application for a response.
 *
 * The obvious next step is a test suite with a database behind it, which needs
 * credentials, seeding, teardown and a CI secret — and therefore does not run
 * on a fork's pull request, does not run for a contributor, and stops running
 * the first week somebody's key expires.
 *
 * This asks a different and surprisingly useful question: with NOTHING
 * configured, does every route degrade to a clear answer rather than a stack
 * trace? That is a promise the README makes ("a keyless preview deploy stays
 * fully browsable") and it had never been checked.
 *
 * It also catches the things that break most often and cost the most to miss:
 * a route that 500s instead of 401ing, a page that throws during server
 * rendering, a redirect that loops, a legal page that does not exist.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT CANNOT TELL YOU
 *
 * Whether the tutor teaches. Whether RLS holds. Whether a payment settles.
 * Those need db:verify-rls, the eval harness, and a real Razorpay account
 * respectively — this is the layer beneath all three. */

type Expect = {
  path: string;
  /* Any of these is a pass. A route that needs auth may answer 401 with keys
     configured and 503 without them, and both are correct behaviour. */
  status: number[];
  method?: "GET" | "POST";
  body?: unknown;
  /* Substring the body must contain. Used where the status alone would not
     distinguish a real answer from a generic error page. */
  contains?: string;
  /* Substring the body must NOT contain. This is the half that matters:
     it is how a leaked answer or a stack trace is caught. */
  absent?: string[];
  why: string;
};

/* Never allowed in any response, on any route, ever. A stack trace names file
   paths and often environment values; the others are the answer key and the
   service-role key. */
const NEVER = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "service_role",
  "distractor_map",
  "at Object.<anonymous>",
  "node_modules/",
];

const CASES: Expect[] = [
  /* --- Public pages must render ---------------------------------------- */
  { path: "/", status: [200], why: "the landing page renders with nothing configured", contains: "<html" },
  { path: "/login", status: [200], why: "auth screens render without Supabase keys" },
  { path: "/signup", status: [200], why: "auth screens render without Supabase keys" },

  /* Legal pages. They did not exist a week ago and Razorpay onboarding
     requires the refund one, so their absence is a launch blocker that would
     otherwise be found by a payments reviewer. */
  { path: "/privacy-policy", status: [200], contains: "Privacy", why: "published privacy policy" },
  { path: "/terms", status: [200], contains: "Terms", why: "published terms" },
  { path: "/refunds", status: [200], contains: "Refund", why: "Razorpay requires a published refund policy" },

  { path: "/offline", status: [200], why: "the service worker's fallback page must be reachable to be cacheable" },
  { path: "/manifest.webmanifest", status: [200], contains: "standalone", why: "installable PWA" },
  { path: "/icon-512.png", status: [200], why: "the manifest points here; a 404 means a white circle on Android" },

  /* --- Signed-out app routes redirect, not crash ------------------------ */
  { path: "/dashboard", status: [200, 307, 302], why: "middleware sends a signed-out visitor to login" },
  { path: "/tutor", status: [200, 307, 302], why: "guarded" },
  { path: "/practice/c8-math-ch1-t2", status: [200, 307, 302], why: "guarded — and it is NOT in the nav, which is how it went unguarded once" },
  { path: "/teacher", status: [200, 307, 302], why: "guarded" },
  { path: "/privacy", status: [200, 307, 302], why: "guarded" },

  /* --- The admin console must not announce itself ----------------------- */
  {
    path: "/admin",
    status: [200, 307, 302, 404],
    absent: ["Review queue", "safety_flags"],
    why: "an admin console that shows its contents to a stranger is a console someone keeps poking at",
  },

  /* --- API routes: a clear refusal, never a 500 ------------------------- */
  { path: "/api/tutor/session", method: "POST", body: {}, status: [401, 503], why: "signed-out cannot start a session" },
  { path: "/api/tutor/practice/next?topicId=x", status: [401, 503], why: "signed-out cannot fetch a question" },
  {
    path: "/api/tutor/practice/attempt",
    method: "POST",
    body: { questionId: "x" },
    status: [401, 503],
    absent: ["correct", "solution"],
    why: "the marking endpoint must refuse before it reveals anything",
  },
  { path: "/api/consent", status: [401, 503], why: "consent state is per account" },
  { path: "/api/billing/status", status: [401, 503], why: "subscription state is per account" },
  { path: "/api/admin/content", status: [401, 404, 503], why: "admin only, and 404 rather than 403" },
  { path: "/api/admin/safety", status: [401, 404, 503], why: "admin only" },

  /* Webhook and cron: unauthenticated callers get nothing. These two are the
     endpoints an attacker finds first, because they are the ones that must be
     reachable without a session. */
  {
    path: "/api/webhooks/razorpay",
    method: "POST",
    body: { event: "subscription.charged" },
    status: [400, 503],
    why: "an unsigned payload must be rejected, not processed",
  },
  {
    path: "/api/cron/parent-reports",
    method: "POST",
    body: {},
    status: [401, 503],
    why: "an unauthenticated caller must not be able to spend money on messages",
  },

  /* The collector is deliberately public — sendBeacon cannot carry credentials
     — so it must accept quietly and never error. */
  {
    path: "/api/analytics",
    method: "POST",
    body: { event: "paywall_viewed", properties: { chapterId: "x", source: "smoke" } },
    status: [204],
    why: "the collector accepts anonymously and answers with no content",
  },

  /* --- A 404 is a 404 ---------------------------------------------------- */
  { path: "/definitely-not-a-page", status: [404], why: "unknown paths 404 rather than 500" },
];

/* Asked of the server rather than of NODE_ENV: the point is what is running on
   that port, and --url can point anywhere. The marker is the dev-tools bundle,
   which a production build never serves. */
async function isDevServer(base: string): Promise<boolean> {
  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(5000) });
    const body = await response.text();
    return body.includes("next-devtools") || body.includes("react-refresh");
  } catch {
    return false;
  }
}

async function main() {
  const index = process.argv.indexOf("--url");
  const base = (index >= 0 ? process.argv[index + 1] : "http://localhost:3000").replace(/\/$/, "");

  console.log(`Smoke testing ${base}\n`);

  /* Fail fast with something readable rather than 30 connection errors. */
  try {
    await fetch(base, { signal: AbortSignal.timeout(5000) });
  } catch {
    console.error(`Nothing is listening on ${base}.`);
    console.error("Start it first:  npm run build && npm start");
    process.exit(1);
  }

  /* Is this a development server?
   *
   * Next's dev build inlines its own module graph into the HTML, and those
   * paths contain "node_modules/" on every page. Left alone the leak rule
   * fires on all seven public pages and says nothing — and a check that cries
   * wolf every run is a check whose output people stop reading, which is worse
   * than not having it.
   *
   * So the rule is dropped here and the fact is said out loud, because the
   * other failure mode is worse still: a green smoke run against dev read as
   * proof that production does not leak. The stack-trace and answer-key rules
   * still apply — those are ours, not the framework's. */
  const dev = await isDevServer(base);

  const never = dev ? NEVER.filter((entry) => entry !== "node_modules/") : NEVER;

  if (dev) {
    console.log(
      "Development server detected — the \"node_modules/\" rule is off, because\n" +
        "Next's own devtools put that string on every page. Run this against\n" +
        "`npm run build && npm start` before a release, or it proves less than\n" +
        "it looks like it does.\n",
    );
  }

  let passed = 0;
  const failures: string[] = [];

  for (const test of CASES) {
    const label = `${test.method ?? "GET"} ${test.path}`;

    let response: Response;
    let body: string;

    try {
      response = await fetch(`${base}${test.path}`, {
        method: test.method ?? "GET",
        headers: test.body ? { "Content-Type": "application/json" } : undefined,
        body: test.body ? JSON.stringify(test.body) : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
      });

      body = await response.text();
    } catch (error) {
      failures.push(`${label} — request failed: ${(error as Error).message}`);
      console.log(`  FAIL  ${label}  (no response)`);
      continue;
    }

    const problems: string[] = [];

    if (!test.status.includes(response.status)) {
      problems.push(`expected ${test.status.join(" or ")}, got ${response.status}`);
    }

    if (test.contains && !body.includes(test.contains)) {
      problems.push(`body does not contain "${test.contains}"`);
    }

    for (const forbidden of [...(test.absent ?? []), ...never]) {
      if (body.includes(forbidden)) problems.push(`body LEAKS "${forbidden}"`);
    }

    if (problems.length === 0) {
      passed += 1;
      console.log(`  ok    ${label}`);
    } else {
      console.log(`  FAIL  ${label}  ${problems.join("; ")}`);
      failures.push(`${label}: ${problems.join("; ")}  — ${test.why}`);
    }
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);

  if (failures.length > 0) {
    console.log("");
    failures.forEach((failure) => console.log(`  ${failure}`));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
