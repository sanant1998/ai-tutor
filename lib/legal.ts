/* The legal pages, as data.
 *
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE LAUNCH
 *
 * These are DRAFTS. They are accurate about what the code does — every
 * retention period, every category of data and every third party below was
 * read off the schema and the routes, not copied from a template — but nobody
 * qualified has reviewed them, and a privacy policy is a legal instrument
 * rather than a piece of copy.
 *
 * Two specific things a lawyer has to settle before this ships:
 *
 *   - Whether the consent mechanism (OTP to a parent's phone) meets the
 *     "verifiable parental consent" standard in the DPDP Rules as finally
 *     notified. The implementation follows the same standard Indian payments
 *     use, which is defensible and is not the same thing as approved.
 *
 *   - The refund position. What is written here is a commercial promise; make
 *     it one somebody has agreed to honour.
 *
 * The reason they are data rather than JSX is that the consent screen records
 * POLICY_VERSION against every grant. A policy whose text cannot be recovered
 * for a given version makes those records evidence of nothing, so the version
 * and the text live together and move together.
 *
 * No "server-only": the pages are static and these strings are public. */

import { GRIEVANCE_OFFICER, POLICY_VERSION } from "@/lib/consent/purposes";

export { POLICY_VERSION };

export const COMPANY = {
  /* Fill these in before launch. They appear on every page below, and a
     privacy policy without an identifiable controller is not a policy. */
  legalName: process.env.NEXT_PUBLIC_LEGAL_NAME ?? "",
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS ?? "",
  gstin: process.env.NEXT_PUBLIC_GSTIN ?? "",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "",
};

export function companyConfigured() {
  return Boolean(COMPANY.legalName && COMPANY.address && COMPANY.supportEmail);
}

export type Section = { heading: string; body: string[] };

/* --------------------------------------------------------------------------
   Privacy policy

   Written against the schema. If a table is added that holds something about a
   student, it belongs in "What we collect" — and the data export at
   /api/parent/data/[studentId] has to grow at the same time, or the policy and
   the export disagree about what is held.
   -------------------------------------------------------------------------- */
export const PRIVACY: Section[] = [
  {
    heading: "Who this is for",
    body: [
      "PaperPath is used almost entirely by school students, most of them under 18. India's Digital Personal Data Protection Act, 2023 treats a child's personal data as a separate category, and this policy is written on the assumption that the person using the app is a child unless we have been told otherwise.",
      "We ask for a date of birth once, on the screen after sign-up, and we say there why we are asking. If the account belongs to someone under 18, it stays locked and processes nothing until a parent has given consent.",
    ],
  },
  {
    heading: "Parental consent",
    body: [
      "A student names a parent's mobile number. We send that number a one-time code and a single-use link. The parent opens the link, reads what each purpose means, and chooses. Where the parent is sitting with the child, they can instead read the code out — that route grants only the two purposes the app cannot run without.",
      "Consent is recorded per purpose, against the version of this policy the parent was actually shown, with the phone number, the time and the IP address. We keep the wording they saw alongside the record, because a consent recorded against a policy whose text has since changed is evidence of nothing.",
      "There are three purposes. Two are required: running the account, and sending the student's messages to an AI model so the tutor can reply. One is optional and starts switched off: voice input. The app works fully with it refused. Usage statistics are counted without any identity attached, so there is nothing about an individual student to consent to.",
      "There is no marketing or advertising purpose, and there will not be one. Behavioural advertising directed at children is prohibited, so rather than offer a box nobody should tick, we have not built one.",
    ],
  },
  {
    heading: "What we collect",
    body: [
      "Account: name, email address, date of birth, board and class. Kept while the account exists.",
      "Learning: which topics were taught, every question attempted, whether it was right, and what kind of mistake it was. This is what produces the progress score and the fix sheet. Kept while the account exists.",
      "Conversations: what a student types to the tutor and what the tutor replies. Automatically deleted 24 months after it was written.",
      "Voice, only if that purpose was granted: the recording and its transcript. The recording is automatically deleted after 30 days; the transcript is treated as part of the conversation above.",
      "Payments: subscription status, amounts, and tax invoices. We never see or store card or UPI details — those stay with our payment processor. Invoices are kept for the period Indian tax law requires.",
      "Safety: where a message triggers our safety checks, we keep a record of the incident so a person can review it. Kept for 12 months after it is closed.",
      "Technical: server logs, and per-call counts of how many tokens an AI request used. These carry no message text.",
    ],
  },
  {
    heading: "What we do not do",
    body: [
      "We do not sell personal data, and we do not share it with advertisers or data brokers.",
      "We do not use a student's conversations to train AI models — neither ours nor anyone else's.",
      "We do not show a parent the transcript of their child's conversations with the tutor. Parents receive a weekly summary: time studied, accuracy, strong and weak topics. This is deliberate. A student who believes the conversation is being read stops asking the questions that show what they do not understand, and those questions are the whole point. A parent exercising their statutory right to a copy of the data does receive everything, through the export described below.",
      "We do not track children across other websites or apps.",
    ],
  },
  {
    heading: "Who else sees it",
    body: [
      "AI model providers, to generate the tutor's replies and to mark written answers. Only the current concept and the recent part of the conversation is sent — never a student's name, email or contact details.",
      "Our database and hosting providers, which store the data described above.",
      "A messaging provider, to send the consent code and the weekly parent report to the parent's number.",
      "A payment processor, for subscriptions. They handle payment details; we do not.",
      "Some of these providers operate outside India. Where they do, the transfer is limited to what the service needs to function.",
    ],
  },
  {
    heading: "Your rights",
    body: [
      "See everything we hold: the Privacy page in the app has a download button that returns every record about the account as a file, including the conversations. A parent linked to a student account can do the same.",
      "Correct anything wrong: through the app, or by writing to the grievance officer below.",
      "Withdraw consent: the same Privacy page, one switch per purpose, no email required and no explanation needed. Withdrawing a required purpose does not delete anything — the account becomes read-only, so past work stays readable and nothing new is processed.",
      "Delete everything: also on that page. Processing stops immediately and the data is permanently deleted after 30 days, which is a window in which a mistaken request can be undone. Tax invoices are retained where the law requires it; they contain a name, an amount and a date, and nothing about a student's learning.",
      "Complain: to the grievance officer below, and after that to the Data Protection Board of India.",
    ],
  },
  {
    heading: "How long we keep things",
    body: [
      "Conversations: 24 months. Voice recordings: 30 days. Safety records: 12 months after closure. Technical logs: 13 months. Everything else: while the account exists, and 30 days after a deletion request.",
      "These are enforced by a scheduled job, not by anyone remembering to run one.",
    ],
  },
  {
    heading: "Security",
    body: [
      "Data is stored in an access-controlled database where each account can only read its own rows. Answers to questions in the question bank are readable by no signed-in account at all, which is why the app can mark work without the answers ever reaching a browser.",
      "No system is perfectly secure. If a breach affects personal data, we will notify the Data Protection Board and affected users as the Act requires.",
    ],
  },
  {
    heading: "Contact",
    body: [
      GRIEVANCE_OFFICER.name && GRIEVANCE_OFFICER.email
        ? `Grievance Officer: ${GRIEVANCE_OFFICER.name}, ${GRIEVANCE_OFFICER.email}. We respond within ${GRIEVANCE_OFFICER.respondsWithinDays} days.`
        : "GRIEVANCE OFFICER NOT CONFIGURED — set NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME and NEXT_PUBLIC_GRIEVANCE_OFFICER_EMAIL. Publishing this contact is required by law.",
      COMPANY.legalName
        ? `${COMPANY.legalName}, ${COMPANY.address}`
        : "COMPANY DETAILS NOT CONFIGURED — set NEXT_PUBLIC_LEGAL_NAME and NEXT_PUBLIC_LEGAL_ADDRESS.",
    ],
  },
];

/* -------------------------------------------------------------------------- */
export const TERMS: Section[] = [
  {
    heading: "What this service is",
    body: [
      "PaperPath teaches school topics one concept at a time and sets practice on them. It is a study aid. It is not a school, not a tutor you are hiring, and not a guarantee of any exam result.",
      "The teaching content is written by people and delivered by an AI model working only from that content. The model can still make mistakes. Every calculation the tutor writes is checked automatically before you see it, and errors that get through should be reported so the content can be fixed.",
    ],
  },
  {
    heading: "Accounts",
    body: [
      "An account for someone under 18 requires a parent's consent before it can be used, and that consent can be withdrawn at any time.",
      "One account is for one student. Sharing an account means two students' work in one progress record, which makes the teaching worse for both.",
      "Do not attempt to extract answers, bypass the paywall, or interfere with the safety checks. Accounts doing so can be suspended.",
    ],
  },
  {
    heading: "Free and paid",
    body: [
      "The first chapter of a subject is free in full — every concept, every question, the fix sheet. Not a trial period.",
      "Beyond that, a subscription is required. Prices are shown in the app inclusive of GST.",
      "A subscription renews automatically through a UPI mandate or card until it is cancelled. Cancelling stops the next renewal; access continues to the end of the period already paid for.",
    ],
  },
  {
    heading: "If a payment fails",
    body: [
      "Access continues for three days while we try again and let you know. If it is not resolved in that window, access pauses until a payment succeeds. Nothing is deleted.",
    ],
  },
  {
    heading: "Content",
    body: [
      "The teaching material, the question bank and the software are ours. A student's own answers and notes are theirs.",
      "Questions are original. Where a topic follows a board's syllabus, that is the syllabus and not a claim of endorsement by the board.",
    ],
  },
  {
    heading: "Limits",
    body: [
      "We aim to keep the service available but cannot promise it always will be.",
      "Nothing in these terms limits any right that cannot be limited under Indian law, including consumer rights.",
      "These terms are governed by Indian law.",
    ],
  },
];

/* -------------------------------------------------------------------------- */
export const REFUNDS: Section[] = [
  {
    heading: "The short version",
    body: [
      "Cancel any time. Within seven days of a charge, ask and we refund it in full. After that, cancelling stops the next renewal and the period already paid for runs to its end.",
    ],
  },
  {
    heading: "Why the first chapter is free",
    body: [
      "So that nobody has to buy the product to find out whether it works. A complete free chapter is a better test than any refund policy, and it is why this one can be simple.",
    ],
  },
  {
    heading: "How to cancel",
    body: [
      "In the app, on the plan screen. It takes one tap and does not go through support. Cancelling does not delete anything — progress, notes and the fix sheet all stay readable.",
    ],
  },
  {
    heading: "How to ask for a refund",
    body: [
      COMPANY.supportEmail
        ? `Email ${COMPANY.supportEmail} from the address on the account, within seven days of the charge. Refunds are processed back to the original payment method and typically take 5-7 working days to appear.`
        : "SUPPORT EMAIL NOT CONFIGURED — set NEXT_PUBLIC_SUPPORT_EMAIL.",
      "A duplicate charge, or a charge after a cancellation, is refunded whenever it is reported — the seven days do not apply to our mistakes.",
    ],
  },
  {
    heading: "Annual plans",
    body: [
      "The same seven days apply. After that, an annual plan can be cancelled but is not refunded pro rata.",
    ],
  },
];
