"use client";

/* The first screen after signing up, and the only one that decides which
 * product this account is.
 *
 * ---------------------------------------------------------------------------
 * WHY THE AGE QUESTION COMES BEFORE ANYTHING ELSE
 *
 * Everything downstream depends on it. A minor cannot be processed without a
 * parent's consent; an adult can consent for themselves; a teacher needs
 * neither and should never see a screen asking for their mother's phone
 * number.
 *
 * It also cannot be asked at signup. A date of birth collected on a form that
 * has not yet said why it wants one is collection without a stated purpose,
 * which is the thing the whole consent flow exists to avoid. So it is asked
 * here, one screen later, with the reason above the field.
 *
 * ---------------------------------------------------------------------------
 * WHAT REPLACED WHAT
 *
 * This used to go straight to "give us your parent's number". A teacher or a
 * parent signing up was sent to that screen, had no way past it, and their
 * account was stuck for ever. The gate was right and the flow was unusable. */

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { RequestConsent } from "@/components/consent/RequestConsent";
import { Button } from "@/components/ui/button";
import { PURPOSES, type PurposeKey } from "@/lib/consent/purposes";

type Who = "student" | "parent" | "teacher";

export function AgeGate({ firstName }: { firstName: string }) {
  const [who, setWho] = useState<Who>("student");
  const [dob, setDob] = useState("");
  const [optional, setOptional] = useState<Set<PurposeKey>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /* Set once the answer is "a student under 18", at which point the parental
     flow takes over the screen. */
  const [needsParent, setNeedsParent] = useState(false);

  if (needsParent) return <RequestConsent firstName={firstName} dobAlreadyGiven />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/consent/adult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dob,
          role: who,
          purposes: [
            ...PURPOSES.filter((purpose) => purpose.required).map((purpose) => purpose.key),
            ...optional,
          ],
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Kuch gadbad hui.");
        return;
      }

      if (payload.adult === false) {
        /* Under 18. The DOB is already stored, so the parental screen does not
           ask for it again. */
        setNeedsParent(true);
        return;
      }

      window.location.href = payload.next ?? "/onboarding";
    } catch {
      setError("Network problem. Dobara try karo.");
    } finally {
      setBusy(false);
    }
  };

  const adult = dob && (Date.now() - new Date(dob).getTime()) / (365.25 * 86400000) >= 18;

  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">
        {firstName ? `${firstName}, ek` : "Ek"} minute — pehle ye batao
      </h1>

      <p className="mt-3 text-[15px] leading-relaxed opacity-75">
        Ye app zyadatar school ke bachchon ke liye hai, aur kanoon ke hisaab se
        18 saal se kam umr walon ka data istemaal karne se pehle unke parent ki
        anumati chahiye. Isliye ye do sawal.
      </p>

      <form onSubmit={submit} className="mt-7 space-y-5">
        <fieldset>
          <legend className="mb-2 text-[14px] font-semibold">Aap kaun hain?</legend>

          <div className="space-y-2">
            {(
              [
                ["student", "Main student hoon — padhne aaya/aayi hoon"],
                ["parent", "Main parent hoon — apne bachche ka progress dekhna hai"],
                ["teacher", "Main teacher hoon — apni class dekhni hai"],
              ] as [Who, string][]
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-black/10 px-4 py-3 dark:border-white/10"
              >
                <input
                  type="radio"
                  name="who"
                  checked={who === value}
                  onChange={() => setWho(value)}
                  className="h-4 w-4"
                />
                <span className="text-[15px]">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1.5 block text-[14px] font-semibold">
            Aapki date of birth
          </span>
          <input
            type="date"
            value={dob}
            onChange={(event) => setDob(event.target.value)}
            required
            max={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-[15px] dark:border-white/15"
          />
          <span className="mt-1.5 block text-[12px] opacity-55">
            Sirf ye tay karne ke liye ki parent ki anumati chahiye ya nahi. Ye
            kisi ko dikhaya nahi jaata.
          </span>
        </label>

        {/* The optional purposes, only for an adult consenting for themselves.
            A minor's optional purposes belong to their parent and are asked on
            the parent's own screen, where they can be read properly. */}
        {adult && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-[14px] font-semibold">
              Ye aapki marzi hai
            </legend>

            {PURPOSES.filter((purpose) => !purpose.required).map((purpose) => (
              <label
                key={purpose.key}
                className="flex cursor-pointer gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10"
              >
                <input
                  type="checkbox"
                  checked={optional.has(purpose.key)}
                  onChange={() =>
                    setOptional((current) => {
                      const next = new Set(current);
                      if (next.has(purpose.key)) next.delete(purpose.key);
                      else next.add(purpose.key);
                      return next;
                    })
                  }
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>
                  <span className="block text-[14px] font-semibold">{purpose.label}</span>
                  <span className="mt-0.5 block text-[12px] opacity-65">
                    {purpose.detail}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-500/10 px-4 py-3 text-[14px] text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        )}

        <Button type="submit" disabled={busy || !dob} className="w-full py-3">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aage badho"}
        </Button>
      </form>
    </main>
  );
}
