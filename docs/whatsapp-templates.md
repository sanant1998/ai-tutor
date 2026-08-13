# WhatsApp templates

Four templates, to be submitted in **Meta Business Manager → WhatsApp Manager →
Message Templates**. Nothing delivers until they are approved.

This is the step that gets skipped. The Cloud API returns `200` for a send
against an unapproved template and nothing arrives, so the integration looks
healthy in staging and is silently dead in production. If parents report
"I never got anything", check here first.

The names below must match `TEMPLATES` in `lib/messaging/send.ts` exactly, and
the parameter **order** must match `reportTemplateParams` in
`lib/parent/report.ts`. A reordered parameter list produces a message saying the
accuracy was 3 and the sessions were 68% — and it delivers successfully.

---

## Category

All four are **Utility**, not Marketing.

That is not a way to pay less. Marketing templates to a number belonging to the
parent of a minor is the thing the DPDP Act prohibits, and a template submitted
under the wrong category is both a compliance problem and a rejection risk.
These are transactional messages about a service the parent asked for.

Language code **`en_US`**. The copy is Hinglish written in Latin script, which
is what these parents read; a Devanagari version needs its own submission and
its own language code.

---

## 1. `paperpath_parent_consent`

Sent once, when a student names their parent's number. This one is on the
critical path — a parent who does not receive it cannot consent, and their child
cannot use the app at all. The SMS fallback in `lib/messaging/send.ts` exists
only for this message.

**Body**

```
Namaste! {{1}} ne PaperPath pe padhai ka account banaya hai.

Kyunki wo 18 saal se kam ke hain, unka data istemaal karne se pehle aapki anumati zaroori hai.

Code: {{2}}

Details aur anumati dene ke liye: {{3}}

Ye code 5 minute me expire ho jaayega.
```

| | |
| --- | --- |
| `{{1}}` | Student's first name |
| `{{2}}` | Six-digit code |
| `{{3}}` | Consent link |

**Sample values for submission:** `Aarav`, `482910`,
`https://paperpath.in/consent/a1b2c3`

> Meta rejects templates whose samples do not look like real data. A URL
> shortener in `{{3}}` also raises the rejection rate — send the real link.

---

## 2. `paperpath_weekly_report`

Sunday 19:00 IST. The retention mechanism.

**Body**

```
{{1}} ki is hafte ki padhai:

Sessions: {{2}}
Minute: {{3}}
Sahi jawab: {{4}}

Agle hafte focus: {{5}}

Poori report app me dekh sakte hain.
```

| | |
| --- | --- |
| `{{1}}` | Student's first name |
| `{{2}}` | Session count |
| `{{3}}` | Minutes studied |
| `{{4}}` | Accuracy, e.g. `78%` or `—` |
| `{{5}}` | Weakest topic |

**Sample:** `Aarav`, `4`, `86`, `78%`, `Additive Inverse`

A quiet week is not sent at all the first time and once thereafter — see the
reasoning in `app/api/cron/parent-reports/route.ts`. Four "0 sessions" messages
in a row trains a parent to ignore the channel, and the channel is the asset.

---

## 3. `paperpath_payment_failed`

Sent on `subscription.pending`. The message that recovers most of a 15-20%
mandate failure rate.

**Body**

```
PaperPath: is mahine ki payment ({{1}}) nahi ho paayi.

Ghabraiye mat — padhai abhi bhi chalu hai. Agle {{2}} din me payment method theek kar lein, taaki koi rukawat na aaye.

App khol kar payment update kar sakte hain.
```

| | |
| --- | --- |
| `{{1}}` | Amount, e.g. `₹399` |
| `{{2}}` | Grace days remaining |

**Sample:** `₹399`, `3`

> The tone is deliberate. Most of these are a short balance on the 3rd, not a
> parent who wants to cancel. A message that reads like a debt collector's
> converts worse than one that reads like a reminder.

---

## 4. `paperpath_safety_alert`

Sent when the safety gate escalates and the parent has consented to alerts.

**Body**

```
Namaste. {{1}} ne aaj PaperPath pe kuch aisa likha jisse humein laga ki aapko batana chahiye.

Hum ek padhai ka app hain, is baare me madad karne ke liye sahi jagah nahi. Please unse baat kariye.

Madad ke liye: Tele-MANAS 14416 (24x7, free)
```

| | |
| --- | --- |
| `{{1}}` | Student's first name |

**Sample:** `Aarav`

> This template says nothing about what was written. That is deliberate — the
> parent needs to know to have a conversation, and quoting a distressed child's
> words back to their parent over WhatsApp could make the conversation worse.
> The excerpt stays in `safety_flags` for a human reviewer.
>
> Sending this at all is gated on consent. It has not been wired to a sender
> yet; the flag is written and the escalation reply is shown to the student.
> Decide the policy before switching it on — an alert sent to the wrong adult
> is a serious harm, and there is no way to know from here which adult a
> number belongs to.

---

## Checklist before launch

- [ ] All four submitted and **approved** (usually under an hour, sometimes a day)
- [ ] Phone number verified and attached to `WHATSAPP_PHONE_ID`
- [ ] `WHATSAPP_TOKEN` is a **permanent** system-user token, not the 24-hour test token
- [ ] Test send to a real number for each template
- [ ] Parameter order double-checked against `reportTemplateParams`
- [ ] SMS fallback configured with a DLT-registered template for the consent code
