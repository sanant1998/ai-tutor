"use client";

/* Consent, data export and deletion — on one screen, reachable in one tap.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT BURIED
 *
 * The DPDP Act requires that withdrawing consent be as easy as giving it. Most
 * products treat that as a legal box and route withdrawal through a support
 * email, which is compliance theatre — the whole point is that a parent who
 * changes their mind can act on it without asking permission from the company
 * they changed their mind about.
 *
 * So: every purpose with its current state, a switch on each optional one, a
 * download button and a delete button. No confirmation funnels, no "are you
 * sure you want to lose all your progress" — the delete dialog states what is
 * kept and what goes, once, and then does it.
 *
 * The one place a confirmation IS warranted is deletion, because it is the
 * only irreversible action here. Withdrawal is not: it can be granted again. */

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { GRIEVANCE_OFFICER, grievanceConfigured } from "@/lib/consent/purposes";
import { acc, text } from "@/lib/theme";

type PurposeState = {
  key: string;
  label: string;
  detail: string;
  required: boolean;
  granted: boolean;
  grantedAt: string | null;
  stale: boolean;
};

type Consent = {
  accountState: string;
  isMinor: boolean;
  policyVersion: string;
  purposes: PurposeState[];
  canStudy: boolean;
};

export function PrivacyView({ userId }: { userId: string }) {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/consent");
      const payload = await response.json();
      if (response.ok) setConsent(payload);
      else setMessage(payload.error ?? "Load nahi ho paaya.");
    } catch {
      setMessage("Network problem.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const withdraw = async (purposes?: string[]) => {
    setBusy(purposes?.[0] ?? "all");
    setMessage("");

    try {
      const response = await fetch("/api/consent", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purposes: purposes ?? [] }),
      });

      const payload = await response.json();
      setMessage(payload.note ?? payload.error ?? "");
      await load();
    } finally {
      setBusy("");
    }
  };

  const exportData = () => {
    /* A plain navigation, not a fetch-then-blob. The response already carries
       Content-Disposition and no-store, and letting the browser handle it
       keeps a file of personal data out of JavaScript memory. */
    window.location.href = `/api/parent/data/${userId}`;
  };

  const requestDeletion = async () => {
    setBusy("delete");

    try {
      const response = await fetch(`/api/parent/data/${userId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "all" }),
      });

      const payload = await response.json();

      setMessage(
        response.ok
          ? `Request darj ho gayi. ${new Date(payload.hardDeleteAfter).toLocaleDateString("en-IN")} tak data hata diya jaayega. Us din se pehle sign in karke cancel kar sakte hain.${payload.retained ? ` ${payload.retained}` : ""}`
          : (payload.error ?? "Request nahi ho paayi."),
      );

      setConfirmDelete(false);
      await load();
    } finally {
      setBusy("");
    }
  };

  if (!consent) {
    return (
      <div className="flex items-center gap-2 py-16" style={{ color: text(0.5) }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-[14px]">Load ho raha hai…</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p
          className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: text(0.45) }}
        >
          Privacy
        </p>
        <h1
          className="font-display mt-2 text-[2rem] font-extrabold tracking-[-0.035em]"
          style={{ color: text() }}
        >
          Aapka data, aapke control me
        </h1>
      </header>

      {message && (
        <Panel className="p-4">
          <p className="text-[14px]" style={{ color: text(0.75) }}>
            {message}
          </p>
        </Panel>
      )}

      {consent.accountState === "read_only" && (
        <Panel className="p-4">
          <p className="text-[14px]" style={{ color: text(0.75) }}>
            Ye account abhi read-only hai — purana kaam padha ja sakta hai, nayi
            padhai band hai. Chalu karne ke liye parent ko dobara anumati deni
            hogi.
          </p>
        </Panel>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-lg font-extrabold" style={{ color: text() }}>
          Kis-kis cheez ki anumati di gayi hai
        </h2>

        {consent.purposes.map((purpose) => (
          <Panel key={purpose.key} className="flex items-start justify-between gap-4 p-4">
            <div>
              <p className="text-[15px] font-semibold" style={{ color: text(0.9) }}>
                {purpose.label}
              </p>
              <p className="mt-1 text-[13px]" style={{ color: text(0.62) }}>
                {purpose.detail}
              </p>
              <p className="mt-1.5 text-[12px]" style={{ color: text(0.45) }}>
                {purpose.granted
                  ? `Di gayi${purpose.grantedAt ? ` ${new Date(purpose.grantedAt).toLocaleDateString("en-IN")}` : ""}`
                  : "Nahi di gayi"}
                {purpose.required ? " · zaroori" : ""}
                {/* A grant made against an older policy is still a grant. Said
                    here rather than acted on — locking a child out over a
                    wording change would be worse than the drift. */}
                {purpose.stale ? " · policy tab se badli hai" : ""}
              </p>
            </div>

            {purpose.granted && (
              <Button
                type="button"
                onClick={() => void withdraw([purpose.key])}
                disabled={busy !== ""}
                className="shrink-0 px-3 py-1.5 text-[13px]"
              >
                {busy === purpose.key ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Wapas lo"
                )}
              </Button>
            )}
          </Panel>
        ))}

        <p className="text-[12px]" style={{ color: text(0.45) }}>
          Zaroori anumati wapas lene par account read-only ho jaayega — data
          delete nahi hoga. Policy version {consent.policyVersion}.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-extrabold" style={{ color: text() }}>
          Data
        </h2>

        <Panel className="flex items-start justify-between gap-4 p-4">
          <div>
            <p className="text-[15px] font-semibold" style={{ color: text(0.9) }}>
              Poora data download karo
            </p>
            <p className="mt-1 text-[13px]" style={{ color: text(0.62) }}>
              Ek JSON file — progress, saare attempts, tutor se hui baat-cheet,
              consent ka record aur invoices.
            </p>
          </div>

          <Button type="button" onClick={exportData} className="shrink-0 px-3 py-1.5 text-[13px]">
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>
        </Panel>

        <Panel className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[15px] font-semibold" style={{ color: text(0.9) }}>
                Sab kuch delete karo
              </p>
              <p className="mt-1 text-[13px]" style={{ color: text(0.62) }}>
                Processing turant band, aur 30 din baad data hamesha ke liye
                hata diya jaayega. Us se pehle cancel kar sakte hain.
              </p>
            </div>

            {!confirmDelete && (
              <Button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="shrink-0 px-3 py-1.5 text-[13px]"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>

          {/* The only confirmation on this screen, because deletion is the only
              thing here that cannot be undone. */}
          {confirmDelete && (
            <div className="space-y-2 rounded-xl p-3" style={{ background: acc(0.09) }}>
              <p className="text-[14px]" style={{ color: text(0.85) }}>
                Pakka? Padhai ka poora record, tutor se hui saari baat-cheet aur
                progress — sab chala jaayega. Tax invoices kanoonan rakhne
                padte hain; unme naam, raqam aur tareekh hoti hai, padhai ka
                kuch nahi.
              </p>

              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => void requestDeletion()}
                  disabled={busy !== ""}
                  className="px-3 py-1.5 text-[13px]"
                >
                  {busy === "delete" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Haan, delete karo"
                  )}
                </Button>

                <Button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-[13px]"
                >
                  Rehne do
                </Button>
              </div>
            </div>
          )}
        </Panel>
      </section>

      <section className="space-y-2 border-t pt-4" style={{ borderColor: text(0.1) }}>
        <h2 className="text-[14px] font-semibold" style={{ color: text(0.8) }}>
          Shikayat
        </h2>

        {grievanceConfigured() ? (
          <p className="text-[13px]" style={{ color: text(0.62) }}>
            {GRIEVANCE_OFFICER.name} — {GRIEVANCE_OFFICER.email}. Jawab{" "}
            {GRIEVANCE_OFFICER.respondsWithinDays} din ke andar.
          </p>
        ) : (
          <p className="text-[13px] text-amber-700 dark:text-amber-400">
            Grievance officer not configured. Set
            NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME and
            NEXT_PUBLIC_GRIEVANCE_OFFICER_EMAIL — publishing this contact is
            required under the DPDP Act.
          </p>
        )}
      </section>
    </div>
  );
}
