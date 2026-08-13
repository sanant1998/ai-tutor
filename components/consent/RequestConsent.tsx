"use client";

/* The student's side: name a parent, get them a link.
 *
 * This screen exists because the account is locked until it is completed, so
 * it has to be short and it has to explain WHY it is being asked — a
 * thirteen-year-old told only "enter your parent's number" assumes the app is
 * about to spam their mother, and closes it.
 *
 * The date of birth is asked here rather than at signup. It is only needed
 * once there is a consent to attach it to, and collecting a child's birth date
 * before saying what it is for is the kind of thing this whole flow exists to
 * avoid. */

import { useEffect, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PURPOSES } from "@/lib/consent/purposes";

type Sent = {
  challengeId: string;
  sentTo: string;
  delivered: boolean;
  devCode?: string;
  note?: string;
};

export function RequestConsent({
  firstName,
  dobAlreadyGiven = false,
}: {
  firstName: string;
  /* Set when the age gate has already stored it. Asking twice on consecutive
     screens reads as a form that is not paying attention. */
  dobAlreadyGiven?: boolean;
}) {
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /* Once the code has gone out, watch for the parent granting it on THEIR
     phone. Without this the student sits on "message bhej diya" for ever —
     the grant happens on a different device and nothing here would ever know.

     Five seconds. A parent takes a minute or two to read four purposes, so
     this is a handful of cheap requests, and the alternative is a student
     concluding the app is stuck.

     It stops on its own when the answer arrives, and when the component
     unmounts. */
  useEffect(() => {
    if (!sent) return;

    let live = true;

    const timer = setInterval(async () => {
      try {
        const response = await fetch("/api/consent");
        if (!response.ok) return;

        const payload = await response.json();

        if (live && payload.canStudy) {
          clearInterval(timer);
          /* Back to the gate, which decides between onboarding and the
             dashboard rather than this component guessing. */
          window.location.href = "/parent-consent";
        }
      } catch {
        /* A dropped poll is not a failed consent. Try again in five. */
      }
    }, 5000);

    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [sent]);

  const request = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/consent/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dobAlreadyGiven ? { phone } : { phone, dob }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Code nahi bhej paaye.");
        return;
      }

      setSent(payload);
    } catch {
      setError("Network problem. Dobara try karo.");
    } finally {
      setBusy(false);
    }
  };

  /* The second path: the parent is sitting next to the student and reads the
     code out. Same challenge, same verification — the only difference is which
     screen the boxes were ticked on, and the consent row records that. */
  const grantHere = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sent) return;

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/consent/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: sent.challengeId,
          code: code.trim(),
          relation: "parent",
          /* Only the required ones from this path. The optional purposes need
             the parent to have READ them, and a code read aloud across a room
             is not evidence they did — so voice stays off and can
             be turned on later from the parent's own link. */
          purposes: PURPOSES.filter((purpose) => purpose.required).map(
            (purpose) => purpose.key,
          ),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Code galat hai.");
        return;
      }

      /* Back to the gate rather than straight to the dashboard. It knows
         whether this student has onboarded; this component does not, and a
         new student landing on an empty dashboard that says "finish
         onboarding" with nothing to click is a dead end. */
      window.location.href = "/parent-consent";
    } catch {
      setError("Network problem. Dobara try karo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">
        {firstName ? `${firstName}, ek` : "Ek"} chhota sa step bacha hai
      </h1>

      <p className="mt-3 text-[15px] leading-relaxed opacity-75">
        Tum 18 se kam ke ho, to shuru karne se pehle tumhare parent ki anumati
        chahiye — ye kanoon hai. Unka number do, hum unhe ek message bhejenge.
        Ek minute ka kaam hai.
      </p>

      {!sent ? (
        <form onSubmit={request} className="mt-7 space-y-4">
          {!dobAlreadyGiven && (
            <label className="block">
              <span className="mb-1.5 block text-[14px] font-semibold">
                Tumhari date of birth
              </span>
              <input
                type="date"
                value={dob}
                onChange={(event) => setDob(event.target.value)}
                required
                max={new Date().toISOString().slice(0, 10)}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-[15px] dark:border-white/15"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-[14px] font-semibold">
              Parent ka WhatsApp number
            </span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              required
              placeholder="98765 43210"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-[15px] dark:border-white/15"
            />
            <span className="mt-1.5 block text-[12px] opacity-55">
              Isi number pe har hafte ek chhota progress report bhi jaayega.
              Koi promotional message nahi.
            </span>
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-xl bg-red-500/10 px-4 py-3 text-[14px] text-red-700 dark:text-red-300"
            >
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy} className="w-full py-3">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Message bhejo"}
          </Button>
        </form>
      ) : (
        <div className="mt-7 space-y-5">
          <div className="flex items-start gap-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
            <p className="text-[14px] opacity-75">
              {sent.delivered
                ? `${sent.sentTo} pe link bhej diya. Parent us link ko kholkar anumati de sakte hain.`
                : (sent.note ??
                  "Message nahi ja paaya — parent ke saath baithe ho to neeche wala tareeka use karo.")}
            </p>
          </div>

          {sent.devCode && (
            <p className="rounded-xl bg-amber-500/10 px-4 py-3 font-mono text-[13px]">
              Dev only — code {sent.devCode}
            </p>
          )}

          <form onSubmit={grantHere} className="space-y-3">
            <p className="text-[14px] opacity-70">
              Parent paas me hain? Wo message wala code yahan daal dein.
            </p>

            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-center font-mono text-[18px] tracking-[0.3em] dark:border-white/15"
            />

            {error && (
              <p className="rounded-xl bg-red-500/10 px-4 py-3 text-[14px] text-red-700 dark:text-red-300">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy || code.length !== 6} className="w-full py-3">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm karo"}
            </Button>

            <p className="text-[12px] opacity-55">
              Is tareeke se sirf zaroori do anumatiyan milti hain. Voice parent
              apne link se baad me chalu kar sakte hain.
            </p>
          </form>

          <button
            type="button"
            onClick={() => {
              setSent(null);
              setCode("");
              setError("");
            }}
            className="text-[13px] underline opacity-60"
          >
            Number galat tha? Badlo
          </button>
        </div>
      )}
    </main>
  );
}
