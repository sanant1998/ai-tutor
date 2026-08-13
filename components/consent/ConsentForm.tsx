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
        setError(payload.error ?? "Kuch gadbad hui.");
        return;
      }

      setDone({ studentName: payload.studentName, granted: payload.granted });
    } catch {
      setError("Network problem. Dobara try karo.");
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
            Anumati mil gayi
          </h1>
        </div>

        <p className="text-[15px] opacity-75">
          Shukriya. {done.studentName ? `${done.studentName} ka` : "Bachche ka"} account ab
          chalu ho gaya hai — wo padhai shuru kar sakte hain.
        </p>

        <p className="text-[14px] opacity-60">
          Aap kabhi bhi ye anumati wapas le sakte hain, ya bachche ka poora data
          download ya delete karwa sakte hain. Iske liye app ke Settings me
          jaayein — kisi se poochhne ki zaroorat nahi.
        </p>

        <p className="text-[13px] opacity-50">
          Har hafte ek chhota report aapke isi number pe aayega: kitni padhai
          hui, kya theek chal raha hai, aur kis topic pe dhyan chahiye.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/5 dark:bg-white/10">
          <ShieldCheck className="h-5 w-5 opacity-70" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">
            Parent ki anumati
          </h1>
          <p className="text-[13px] opacity-55">
            Aapke bachche ne PaperPath pe account banaya hai
          </p>
        </div>
      </div>

      <p className="mb-6 text-[15px] leading-relaxed opacity-80">
        Kyunki wo 18 saal se kam ke hain, kanoon ke hisaab se unka data istemaal
        karne se pehle aapki anumati zaroori hai. Neeche likha hai ki hum kya
        istemaal karenge aur kyun. Har cheez alag hai — jo aap chahein wahi
        chuniye.
      </p>

      <form onSubmit={submit} className="space-y-6">
        <fieldset className="space-y-3">
          <legend className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] opacity-50">
            App chalne ke liye zaroori
          </legend>

          {PURPOSES.filter((purpose) => purpose.required).map((purpose) => (
            <label
              key={purpose.key}
              className="flex cursor-default gap-3 rounded-xl border border-black/10 p-4 dark:border-white/10"
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
            In dono ke bina app chal hi nahi sakta. Agar aap sehmat nahi hain to
            ye page band kar dijiye — account nahi banega aur koi data istemaal
            nahi hoga.
          </p>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] opacity-50">
            Aapki marzi — mana karne par bhi app poora chalega
          </legend>

          {PURPOSES.filter((purpose) => !purpose.required).map((purpose) => (
            <label
              key={purpose.key}
              className="flex cursor-pointer gap-3 rounded-xl border border-black/10 p-4 dark:border-white/10"
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
              Aap bachche ke kya lagte hain?
            </span>
            <select
              value={relation}
              onChange={(event) => setRelation(event.target.value)}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-[15px] dark:border-white/15"
            >
              <option value="parent">Mata / Pita</option>
              <option value="guardian">Abhibhavak (guardian)</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[14px] font-semibold">
              Message me aaya 6 ank ka code
            </span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 font-mono text-[18px] tracking-[0.3em] dark:border-white/15"
            />
          </label>
        </div>

        {error && (
          <p className="rounded-xl bg-red-500/10 px-4 py-3 text-[14px] text-red-700 dark:text-red-300">
            {error}
          </p>
        )}

        <Button type="submit" disabled={busy || code.length !== 6} className="w-full py-3">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Anumati deta/deti hoon"}
        </Button>

        <div className="space-y-2 border-t border-black/10 pt-4 text-[12px] opacity-55 dark:border-white/10">
          <p>
            Anumati kabhi bhi wapas li ja sakti hai, aur bachche ka poora data
            download ya delete karwaya ja sakta hai. Policy version{" "}
            {POLICY_VERSION}.
          </p>

          {/* Publishing a grievance contact is a statutory requirement, not a
              nicety — so its absence is stated rather than hidden, and shows up
              in review instead of in a regulator's letter. */}
          {grievanceConfigured() ? (
            <p>
              Shikayat ke liye: {GRIEVANCE_OFFICER.name} — {GRIEVANCE_OFFICER.email}.
              Jawab {GRIEVANCE_OFFICER.respondsWithinDays} din ke andar.
            </p>
          ) : (
            <p className="text-amber-700 dark:text-amber-400">
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
