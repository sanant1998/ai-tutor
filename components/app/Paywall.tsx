"use client";

/* The paywall, and the checkout behind it.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT SAYS, AND WHY
 *
 * It leads with what the student has already done. A parent deciding on ₹399
 * is not weighing a feature list — they are deciding whether the thing works
 * for their child, and the only evidence that matters is the chapter they
 * already finished.
 *
 * No countdown, no "offer ends tonight", no strikethrough price that was never
 * charged. This is sold to parents of thirteen-year-olds, urgency tactics are
 * the fastest way to lose that room, and the honest comparison — ₹399 a month
 * against ₹12,000 a year — is stronger than any of them.
 *
 * ---------------------------------------------------------------------------
 * ACCESS IS NOT GRANTED HERE
 *
 * Razorpay's success handler fires before the payment has settled, does not
 * fire at all if the tab is closed on a successful payment, and is a fetch a
 * fourteen-year-old can make by hand. So it starts a poll against
 * /api/billing/status and waits for the webhook. The spinner is not
 * decoration — it is the correctness boundary. */

import { useEffect, useState } from "react";
import { Check, Loader2, Lock } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { acc, text } from "@/lib/theme";

type Plan = { key: string; label: string; amount: number; display: string; note: string };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function Paywall({
  chapterTitle,
  onUnlocked,
}: {
  chapterTitle?: string;
  onUnlocked?: () => void;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [chosen, setChosen] = useState("monthly");
  const [stage, setStage] = useState<"idle" | "opening" | "waiting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/billing/status")
      .then((response) => response.json())
      .then((payload) => setPlans(payload.plans ?? []))
      .catch(() => setPlans([]));
  }, []);

  /* Loaded on demand rather than in the layout: the checkout script is ~70 KB
     and every student who never sees a paywall would otherwise pay for it on
     first load. */
  const loadCheckout = () =>
    new Promise<boolean>((resolve) => {
      if (window.Razorpay) return resolve(true);

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const pollUntilActive = async () => {
    setStage("waiting");

    /* Two minutes. The webhook normally lands in seconds; a mandate that has
       not confirmed by then needs a different message rather than a longer
       spinner. */
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      try {
        const payload = await fetch("/api/billing/status").then((r) => r.json());

        if (payload.status === "active") {
          setStage("done");
          onUnlocked?.();
          return;
        }
      } catch {
        /* Keep waiting — a dropped poll is not a failed payment. */
      }
    }

    setStage("error");
    setMessage(
      "Payment confirm hone me waqt lag raha hai. Paisa kata hai to access apne aap khul jaayega — page refresh karke dekhein.",
    );
  };

  const start = async () => {
    setStage("opening");
    setMessage("");

    try {
      const response = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: chosen }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setStage("error");
        setMessage(payload.error ?? "Payment shuru nahi ho paaya.");
        return;
      }

      const loaded = await loadCheckout();

      /* The hosted page as a fallback. On a weak connection the inline script
         sometimes never arrives, and a redirect is better than a dead button. */
      if (!loaded || !window.Razorpay) {
        window.location.href = payload.fallbackUrl;
        return;
      }

      const checkout = new window.Razorpay({
        key: payload.keyId,
        subscription_id: payload.subscriptionId,
        name: "PaperPath",
        description: `${payload.plan.label} — ${payload.plan.display}`,
        /* UPI first. It is the rail that actually renews in this market. */
        config: {
          display: {
            sequence: ["block.upi", "block.other"],
            preferences: { show_default_blocks: true },
            blocks: {
              upi: { name: "UPI Autopay", instruments: [{ method: "upi" }] },
            },
          },
        },
        handler: () => void pollUntilActive(),
        modal: {
          ondismiss: () => {
            setStage("idle");
            setMessage("Payment cancel ho gaya. Kabhi bhi dobara try kar sakte hain.");
          },
        },
        theme: { color: "#111111" },
      });

      checkout.open();
    } catch {
      setStage("error");
      setMessage("Network problem. Dobara try karein.");
    }
  };

  if (stage === "done") {
    return (
      <Panel className="space-y-2 p-6">
        <p className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: text(0.9) }}>
          <Check className="h-4 w-4" />
          Ho gaya — poora syllabus khul gaya.
        </p>
        <p className="text-[14px]" style={{ color: text(0.6) }}>
          Receipt aapke email pe aa jayegi. Chalo padhai pe wapas chalte hain.
        </p>
      </Panel>
    );
  }

  if (stage === "waiting") {
    return (
      <Panel className="space-y-2 p-6">
        <p className="flex items-center gap-2 text-[15px]" style={{ color: text(0.85) }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Payment confirm ho raha hai…
        </p>
        <p className="text-[13px]" style={{ color: text(0.55) }}>
          Ye page band mat karein. Bank se confirmation aate hi access khul
          jaayega.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="space-y-5 p-6">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: acc(0.14), color: acc() }}
        >
          <Lock className="h-4 w-4" />
        </span>

        <div>
          <h2 className="font-display text-xl font-extrabold tracking-[-0.02em]" style={{ color: text() }}>
            Pehla chapter poora free tha
          </h2>
          <p className="mt-1.5 text-[15px]" style={{ color: text(0.7) }}>
            {chapterTitle ? `"${chapterTitle}"` : "Ye chapter"} uske aage ka
            hai. Poora syllabus kholne ke liye plan lena hoga — jo padha, wo
            saara safe hai.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((plan) => (
          <button
            key={plan.key}
            type="button"
            onClick={() => setChosen(plan.key)}
            className="rounded-xl p-4 text-left transition-opacity hover:opacity-90"
            style={{
              border: `1px solid ${chosen === plan.key ? acc(0.6) : text(0.12)}`,
              background: chosen === plan.key ? acc(0.08) : "transparent",
            }}
          >
            <p className="text-[13px] font-semibold" style={{ color: text(0.6) }}>
              {plan.label}
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold" style={{ color: text() }}>
              {plan.display}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: text(0.55) }}>
              {plan.note}
            </p>
          </button>
        ))}
      </div>

      <ul className="space-y-1.5 text-[14px]" style={{ color: text(0.7) }}>
        <li>· Saare chapters, saare topics, unlimited practice</li>
        <li>· Har hafte parent ko WhatsApp pe progress report</li>
        <li>· Fix sheet — jo galtiyan baar-baar hoti hain, sirf unki practice</li>
      </ul>

      {message && (
        <p className="text-[14px]" style={{ color: text(0.65) }}>
          {message}
        </p>
      )}

      <Button type="button" onClick={() => void start()} disabled={stage === "opening"} className="w-full py-3">
        {stage === "opening" ? <Loader2 className="h-4 w-4 animate-spin" /> : "UPI se shuru karein"}
      </Button>

      <p className="text-[12px]" style={{ color: text(0.45) }}>
        UPI Autopay mandate banega — har mahine apne aap kat jaayega, aur kabhi
        bhi band kar sakte hain. Coaching ₹12,000 saal ka leti hai; ye ₹
        {plans.find((plan) => plan.key === "annual")?.amount
          ? (plans.find((plan) => plan.key === "annual")!.amount / 100).toLocaleString("en-IN")
          : "3,990"}{" "}
        saal ka hai.
      </p>
    </Panel>
  );
}
