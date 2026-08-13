"use client";

/* The consent screen, as read by a parent on a phone.
 *
 * Three things it deliberately does NOT do, because each is a dark pattern
 * that would make the consent worthless as consent:
 *
 *   - No pre-ticked optional boxes. Voice starts off. A box the
 *     parent had to notice and untick is not a decision they made.
 *   - No "Agree to all" button. It exists to stop people reading, which is the
 *     opposite of informed.
 *   - No styling that makes refusal look like the mistake. The required and
 *     optional groups are visually equal, and refusing the optional ones is
 *     stated as fine because it is.
 *
 * The detail line under each purpose says what is processed and for how long.
 * That sentence is the difference between consent and a click. */

import { useState } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  GRIEVANCE_OFFICER,
  grievanceConfigured,
  POLICY_VERSION,
  PURPOSES,
  type PurposeKey,
} from "@/lib/consent/purposes";

export function ConsentForm({ challengeId }: { challengeId: string }) {
  const [code, setCode] = useState("");
  const [relation, setRelation] = useState("parent");
  const [chosen, setChosen] = useState<Set<PurposeKey>>(
    /* Required ones on, optional ones off. */
    new Set(PURPOSES.filter((purpose) => purpose.required).map((purpose) => purpose.key)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ studentName: string; granted: string[] } | null>(null);

  const toggle = (key: PurposeKey, required: boolean) => {
    if (required) return;
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/consent/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          code: code.trim(),
          relation,
          purposes: [...chosen],
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Something went wrong.");
        return;
      }

      setDone({ studentName: payload.studentName, granted: payload.granted });
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 px-5 py-12">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
            <Check className="h-5 w-5" />
          </span>
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">
            Permission given
          </h1>
        </div>

        <p className="text-[15px] opacity-75">
          Thank you. {done.studentName ? `${done.studentName}’s` : "Your child’s"} account
          is now active — they can start studying.
        </p>

        <p className="text-[14px] opacity-60">
          You can withdraw this permission at any time, or download or delete your
          child’s data in full. It is all in the app’s Settings — you do not have
          to ask anyone.
        </p>

        <p className="text-[13px] opacity-50">
          A short report comes to this same number every week: how much studying
          was done, what is going well, and which topic needs attention.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgb(var(--text-rgb)/0.06)]">
          <ShieldCheck className="h-5 w-5 opacity-70" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">
            Parent’s permission
          </h1>
          <p className="text-[13px] opacity-55">
            Your child has created a PaperPath account
          </p>
        </div>
      </div>

      <p className="mb-6 text-[15px] leading-relaxed opacity-80">
        Because they are under 18, the law requires your permission before their
        data can be used. Below is what we would use and why. Each one is a
        separate choice — pick only what you are happy with.
      </p>

      <form onSubmit={submit} className="space-y-6">
        <fieldset className="space-y-3">
          <legend className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] opacity-50">
            Needed for the app to work
          </legend>

          {PURPOSES.filter((purpose) => purpose.required).map((purpose) => (
            <label
              key={purpose.key}
              className="flex cursor-default gap-3 rounded-xl border border-[rgb(var(--text-rgb)/0.12)] p-4"
            >
              <input
                type="checkbox"
                checked
                readOnly
                className="mt-1 h-4 w-4 shrink-0"
                aria-describedby={`${purpose.key}-detail`}
              />
              <span>
                <span className="block text-[15px] font-semibold">{purpose.label}</span>
                <span id={`${purpose.key}-detail`} className="mt-1 block text-[13px] opacity-65">
                  {purpose.detail}
                </span>
              </span>
            </label>
          ))}

          <p className="text-[13px] opacity-55">
            The app cannot work without these two. If you do not agree, simply close
            this page — no account will be created and no data will be used.
          </p>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] opacity-50">
            Up to you — the app works fully either way
          </legend>

          {PURPOSES.filter((purpose) => !purpose.required).map((purpose) => (
            <label
              key={purpose.key}
              className="flex cursor-pointer gap-3 rounded-xl border border-[rgb(var(--text-rgb)/0.12)] p-4"
            >
              <input
                type="checkbox"
                checked={chosen.has(purpose.key)}
                onChange={() => toggle(purpose.key, purpose.required)}
                className="mt-1 h-4 w-4 shrink-0"
                aria-describedby={`${purpose.key}-detail`}
              />
              <span>
                <span className="block text-[15px] font-semibold">{purpose.label}</span>
                <span id={`${purpose.key}-detail`} className="mt-1 block text-[13px] opacity-65">
                  {purpose.detail}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[14px] font-semibold">
              What are you to the child?
            </span>
            <select
              value={relation}
              onChange={(event) => setRelation(event.target.value)}
              className="w-full rounded-xl border border-[rgb(var(--text-rgb)/0.12)] bg-transparent px-3 py-2.5 text-[15px]"
            >
              <option value="parent">Mother / Father</option>
              <option value="guardian">Guardian</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[14px] font-semibold">
              The 6-digit code from the message
            </span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="w-full rounded-xl border border-[rgb(var(--text-rgb)/0.12)] bg-transparent px-3 py-2.5 font-mono text-[18px] tracking-[0.3em]"
            />
          </label>
        </div>

        {error && (
          <p className="rounded-xl bg-red-500/10 px-4 py-3 text-[14px] text-[var(--danger)]">
            {error}
          </p>
        )}

        <Button type="submit" disabled={busy || code.length !== 6} className="w-full py-3">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "I give permission"}
        </Button>

        <div className="space-y-2 border-t border-[rgb(var(--text-rgb)/0.12)] pt-4 text-[12px] opacity-55">
          <p>
            Permission can be withdrawn at any time, and the child’s data can be
            downloaded or deleted in full. Policy version{" "}
            {POLICY_VERSION}.
          </p>

          {/* Publishing a grievance contact is a statutory requirement, not a
              nicety — so its absence is stated rather than hidden, and shows up
              in review instead of in a regulator's letter. */}
          {grievanceConfigured() ? (
            <p>
              For complaints: {GRIEVANCE_OFFICER.name} — {GRIEVANCE_OFFICER.email}.
              A reply within {GRIEVANCE_OFFICER.respondsWithinDays} days.
            </p>
          ) : (
            <p className="text-[var(--warn)]">
              Grievance officer not configured. Set
              NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME and
              NEXT_PUBLIC_GRIEVANCE_OFFICER_EMAIL before launch — publishing this
              contact is required under the DPDP Act.
            </p>
          )}
        </div>
      </form>
    </main>
  );
}
