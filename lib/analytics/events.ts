/* The event taxonomy.
 *
 * Small and typed, in one file, because the failure mode of product analytics
 * is not too few events — it is forty events named six different ways, of
 * which nobody trusts any. A union type here means a typo is a build error and
 * a renamed property breaks the call site rather than a dashboard six weeks
 * later.
 *
 * ---------------------------------------------------------------------------
 * THE ONE NUMBER
 *
 * Activation: a student reaching CONCEPT-CLEAR on at least one topic within 48
 * hours of signing up. Students who do stay; students who do not, leave. Every
 * other number here is diagnostic for that one, and onboarding should be
 * designed backwards from it rather than from signups.
 *
 * Retention is read in weekly cohorts, not DAU. Nobody revises seven days a
 * week, so DAU measures guilt rather than value — and a product whose users
 * come three times a week for a year is a good product with a bad DAU.
 *
 * ---------------------------------------------------------------------------
 * WHAT NEVER GOES IN A PROPERTY
 *
 * No message text, no answers, no names, no phone numbers. Analytics is the
 * place child data leaks from, because it is the one pipe that goes to a third
 * party by design — and under the DPDP Act behavioural tracking of children is
 * not something we get to do carefully, it is something we do not do. Ids and
 * counts only. `track` strips anything that looks like free text. */

export type AnalyticsEvent =
  /* Teaching */
  | { name: "session_started"; topicId: string; conceptId: string; entry: "dashboard" | "fixsheet" | "roadmap" | "direct" }
  | { name: "beat_advanced"; sessionId: string; from: string; to: string; turnsUsed: number }
  | { name: "reteach_entered"; sessionId: string; conceptId: string; attempt: number; strategy: string }
  | { name: "downshift_triggered"; sessionId: string; conceptId: string }
  | { name: "session_completed"; sessionId: string; durationS: number; conceptsDone: number; forced: string | null }
  | { name: "session_abandoned"; sessionId: string; beat: string; turnsUsed: number }

  /* Practice */
  | { name: "question_attempted"; questionId: string; level: string; correct: boolean; timeMs: number; errorType: string; source: string }
  | { name: "misconception_detected"; conceptId: string; misconceptionId: string; source: "distractor_map" | "rule" | "llm" }
  | { name: "mastery_achieved"; topicId: string; band: string; daysToReach: number }
  | { name: "topic_unlocked"; topicId: string }

  /* Money */
  | { name: "paywall_viewed"; chapterId: string; source: string }
  | { name: "checkout_started"; plan: string; amountInr: number }
  | { name: "subscription_activated"; plan: string; method: string }
  | { name: "mandate_failed"; plan: string; attempt: number }
  | { name: "subscription_cancelled"; plan: string; daysActive: number }

  /* Parent */
  | { name: "parent_link_requested"; channel: "whatsapp" | "sms" }
  | { name: "parent_link_confirmed" }
  | { name: "parent_report_sent"; channel: "whatsapp" | "email" }
  | { name: "parent_report_opened"; channel: "whatsapp" | "email" }

  /* Consent — counted, never with content */
  | { name: "consent_granted"; purpose: string; method: string }
  | { name: "consent_withdrawn"; purpose: string }

  /* Health. Not vanity metrics: these are the four numbers that say whether
     the thing is working, and each has an alert behind it. */
  | { name: "verdict_parse_failed"; beat: string; model: string }
  | { name: "output_check_failed"; problem: "prompt_leak" | "answer_leak" | "arithmetic"; beat: string }
  | { name: "provider_fell_back"; from: string; to: string; purpose: string }
  | { name: "safety_intervention"; category: string; action: string };

export type EventName = AnalyticsEvent["name"];

/* Free-text property names are rejected rather than sanitised, because a
   silent strip is a bug that looks like working code. */
const FORBIDDEN = /message|content|answer|text|name|phone|email|transcript|excerpt/i;

export function track(event: AnalyticsEvent) {
  const { name, ...properties } = event;

  for (const key of Object.keys(properties)) {
    if (FORBIDDEN.test(key)) {
      /* Loud in development, dropped in production — the property, not the
         event, so one bad field does not lose the whole signal. */
      if (process.env.NODE_ENV !== "production") {
        throw new Error(
          `[analytics] "${key}" on ${name} looks like free text or personal data. Send an id or a count.`,
        );
      }
      delete (properties as Record<string, unknown>)[key];
    }
  }

  emit(name, properties);
}

/* The sink.
 *
 * Vendor-agnostic on purpose: this posts a plain JSON batch to whatever URL is
 * configured, which every analytics product accepts either natively or through
 * a one-line proxy. Picking an SDK would add a dependency, a script tag on the
 * client, and — with most vendors — third-party cookies on a page used by
 * children, which is the one thing this file exists to avoid.
 *
 * Unset means events go to the console in development and nowhere in
 * production. That is a real gap and it is stated in the README rather than
 * hidden here: an app that cannot tell it is broken is broken.
 *
 * The consent check does NOT live here. It lives in lib/analytics/server.ts,
 * which is the only path that carries a user id — this function never learns
 * who an event is about, which is also why it is safe to call from the client
 * for anonymous UI events. */
function emit(name: string, properties: Record<string, unknown>) {
  /* The built-in collector by default. Point NEXT_PUBLIC_ANALYTICS_URL
     somewhere else to use a vendor instead — the payload is the same plain
     JSON either way.

     Defaulting to /api/analytics rather than to nothing is the point: the
     previous behaviour dropped every event in production unless someone
     remembered to configure a destination, which meant an app that could not
     tell it was broken. */
  const endpoint =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ANALYTICS_URL) ||
    "/api/analytics";

  /* A relative URL cannot be posted to from the server, where there is no
     origin to resolve it against. Server-side events go through
     lib/analytics/server.ts, which is where the consent check lives; if one
     reaches here on the server with the default endpoint, log rather than
     throw. */
  if (endpoint.startsWith("/") && typeof window === "undefined") {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[analytics:server]", name, properties);
    }
    return;
  }

  const body = JSON.stringify({
    event: name,
    properties,
    /* Stamped here rather than by the collector, so a batch delayed by a
       queue keeps the time the thing actually happened. */
    at: new Date().toISOString(),
  });

  /* sendBeacon where it exists: it survives the page being closed, which is
     exactly when the interesting events fire — session_abandoned,
     paywall_viewed, checkout_started. */
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      return;
    } catch {
      /* Fall through to fetch. */
    }
  }

  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* Analytics must never be able to break a lesson. */
  });
}

/* --------------------------------------------------------------------------
   The activation definition, in code

   Written here rather than in a dashboard query so the product and the
   analytics cannot disagree about what activation means.
   -------------------------------------------------------------------------- */
export const ACTIVATION = {
  windowHours: 48,
  /* "Developing" is the band at 40+, which is the point a student has been
     taught a topic and shown they can do the ordinary questions. Below it they
     have watched a lesson; above it they have learned something. */
  requiredBand: "Developing",
  requiredTopics: 1,
};

export function isActivated(input: {
  signedUpAt: string;
  firstBandReachedAt: string | null;
  band: string | null;
}) {
  if (!input.firstBandReachedAt || !input.band) return false;

  const bands = ["Not started", "Foundation", "Developing", "Proficient", "Advanced"];
  if (bands.indexOf(input.band) < bands.indexOf(ACTIVATION.requiredBand)) return false;

  const hours =
    (new Date(input.firstBandReachedAt).getTime() - new Date(input.signedUpAt).getTime()) / 3600000;

  return hours <= ACTIVATION.windowHours;
}
