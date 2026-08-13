/* Reaching a parent.
 *
 * ---------------------------------------------------------------------------
 * WHY WHATSAPP AND NOT EMAIL
 *
 * Indian parents read WhatsApp. Most do not read email at all, and a large
 * share of the ones who do have never opened the address they gave a school.
 * A weekly report by email is a report nobody sees, and a product whose parent
 * loop does not land is a product that does not get renewed.
 *
 * A utility-template message costs roughly ₹0.12. At a weekly report per
 * student that is under ₹7 a year — irrelevant next to the subscription and
 * the single highest-leverage rupee in the business.
 *
 * ---------------------------------------------------------------------------
 * TEMPLATES ARE NOT OPTIONAL
 *
 * Outside a 24-hour customer-initiated window, WhatsApp only delivers messages
 * built from templates Meta has approved in advance. A free-text send outside
 * that window fails silently as far as the user is concerned — the API returns
 * 200 and nothing arrives. So every message here names a template and passes
 * parameters, and `sendText` exists only for replies inside an open window.
 *
 * ---------------------------------------------------------------------------
 * UNCONFIGURED IS A LOUD NO-OP
 *
 * Without credentials this logs what it would have sent and returns
 * `skipped`. It never throws: a consent flow that 500s because the SMS gateway
 * is missing is worse than one that shows the code on screen in development.
 * Callers must check `ok` before telling a user something was sent. */

import "server-only";

export type SendResult =
  | { ok: true; provider: string; id: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; reason: string };

const GRAPH = "https://graph.facebook.com/v21.0";

function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

export function messagingConfigured() {
  return whatsappConfigured() || Boolean(process.env.SMS_API_KEY);
}

/* --------------------------------------------------------------------------
   Templates

   Named here so the app has one list of what must be approved in the Meta
   dashboard before launch. A template referenced in code and not approved in
   the console is the commonest way this integration "works in staging".
   -------------------------------------------------------------------------- */
export const TEMPLATES = {
  /* {{1}} student name, {{2}} six-digit code, {{3}} short link */
  parentConsent: "paperpath_parent_consent",
  /* {{1}} student name, {{2}} sessions, {{3}} minutes, {{4}} accuracy, {{5}} focus topic */
  weeklyReport: "paperpath_weekly_report",
  /* {{1}} amount, {{2}} days of grace remaining */
  paymentFailed: "paperpath_payment_failed",
  /* {{1}} student name */
  safetyAlert: "paperpath_safety_alert",
} as const;

export async function sendTemplate(input: {
  to: string;
  template: string;
  params: string[];
  language?: string;
}): Promise<SendResult> {
  if (!whatsappConfigured()) {
    console.info(
      `[messaging] would send ${input.template} to ${input.to}: ${input.params.join(" | ")}`,
    );
    return { ok: false, skipped: true, reason: "WHATSAPP_TOKEN is not set" };
  }

  try {
    const response = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: input.template,
          /* en_US covers Hinglish written in Latin script, which is what these
             templates are. A Devanagari template needs its own approval and
             its own language code. */
          language: { code: input.language ?? "en_US" },
          components: [
            {
              type: "body",
              parameters: input.params.map((value) => ({ type: "text", text: value })),
            },
          ],
        },
      }),
    });

    const payload = (await response.json()) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };

    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        reason: payload.error?.message ?? `WhatsApp returned ${response.status}`,
      };
    }

    return { ok: true, provider: "whatsapp", id: payload.messages?.[0]?.id ?? "" };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: error instanceof Error ? error.message : "send failed",
    };
  }
}

/* Free text. Only delivers inside a 24-hour window the user opened by
   messaging first — outside it, use a template. */
export async function sendText(to: string, body: string): Promise<SendResult> {
  if (!whatsappConfigured()) {
    console.info(`[messaging] would send to ${to}: ${body.slice(0, 120)}`);
    return { ok: false, skipped: true, reason: "WHATSAPP_TOKEN is not set" };
  }

  try {
    const response = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/^\+/, ""),
        type: "text",
        text: { body },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, skipped: false, reason: detail.slice(0, 200) };
    }

    return { ok: true, provider: "whatsapp", id: "" };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: error instanceof Error ? error.message : "send failed",
    };
  }
}

/* The consent code specifically. Falls back to SMS where WhatsApp is not
   configured but an SMS gateway is: a parent who cannot receive the code
   cannot consent, and a child who cannot get consent cannot use the app — so
   this is the one message worth a second channel. */
export async function sendConsentCode(input: {
  phone: string;
  studentName: string;
  code: string;
  link: string;
}): Promise<SendResult> {
  const viaWhatsapp = await sendTemplate({
    to: input.phone,
    template: TEMPLATES.parentConsent,
    params: [input.studentName, input.code, input.link],
  });

  if (viaWhatsapp.ok || !process.env.SMS_API_KEY) return viaWhatsapp;

  return sendSms(
    input.phone,
    `PaperPath: your permission is needed for ${input.studentName}’s account. Code ${input.code}. Details: ${input.link}`,
  );
}

/* A deliberately thin SMS shim. Indian gateways differ mostly in the query
   parameter names, so the endpoint is configured rather than coded — swapping
   MSG91 for Gupshup should not be a code change. */
async function sendSms(to: string, body: string): Promise<SendResult> {
  const endpoint = process.env.SMS_ENDPOINT;
  const key = process.env.SMS_API_KEY;

  if (!endpoint || !key) {
    return { ok: false, skipped: true, reason: "SMS_ENDPOINT is not set" };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        to,
        message: body,
        /* DLT registration is mandatory for transactional SMS in India; the
           template id comes from the operator, not from us. */
        template_id: process.env.SMS_DLT_TEMPLATE_ID ?? "",
        sender: process.env.SMS_SENDER_ID ?? "",
      }),
    });

    if (!response.ok) {
      return { ok: false, skipped: false, reason: `SMS gateway returned ${response.status}` };
    }

    return { ok: true, provider: "sms", id: "" };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: error instanceof Error ? error.message : "send failed",
    };
  }
}
