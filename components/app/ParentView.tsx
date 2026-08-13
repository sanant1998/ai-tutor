"use client";

/* What a parent sees.
 *
 * ---------------------------------------------------------------------------
 * ONE SCREEN, FIVE NUMBERS
 *
 * A parent gives this thirty seconds a week. So it is one screen: how much was
 * studied, how much was right, what is strong, what is weak, and one thing to
 * do about it. No charts to interpret, no tabs, no "explore your child's
 * learning journey".
 *
 * The weak topic is the point of the whole page. Everything above it is
 * evidence that the app is being used; that line is the only part a parent can
 * act on, so it is stated as an instruction and not as a metric.
 *
 * ---------------------------------------------------------------------------
 * THE TRANSCRIPT IS NOT HERE AND SAYING SO IS DELIBERATE
 *
 * A parent who wonders whether they can read the conversation should find the
 * answer on this page rather than by hunting for it. Told plainly, with the
 * reason, it reads as a considered choice — which it is. Left unmentioned it
 * reads as something being hidden. */

import { useCallback, useEffect, useState } from "react";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { acc, text } from "@/lib/theme";

type Child = { studentId: string; name: string; relation: string; confirmed: boolean };

type Report = {
  student: { id: string; name: string };
  headline: string;
  sessions: number;
  minutes: number;
  questions: { attempted: number; correct: number; accuracy: number | null };
  strong: { topic: string; score: number; band: string }[];
  weak: { topic: string; score: number; band: string }[];
  commonMistake: { name: string; times: number; fix: string } | null;
  action: string;
};

export function ParentView() {
  const [children, setChildren] = useState<Child[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [linking, setLinking] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/parent/link");
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error ?? "Load nahi ho paaya.");
        return;
      }

      setChildren(payload.children ?? []);

      const confirmed = (payload.children ?? []).find((child: Child) => child.confirmed);

      if (confirmed) {
        const reportResponse = await fetch(`/api/parent/report/${confirmed.studentId}`);
        if (reportResponse.ok) setReport(await reportResponse.json());
      }
    } catch {
      setMessage("Network problem.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const link = async (event: React.FormEvent) => {
    event.preventDefault();
    setLinking(true);
    setMessage("");

    try {
      const isEmail = identifier.includes("@");

      const response = await fetch("/api/parent/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEmail ? { studentEmail: identifier } : { studentPhone: identifier },
        ),
      });

      const payload = await response.json();
      setMessage(payload.note ?? payload.error ?? "");
      setIdentifier("");
      await load();
    } finally {
      setLinking(false);
    }
  };

  if (loading) {
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
          Parent
        </p>
        <h1
          className="font-display mt-2 text-[2rem] font-extrabold tracking-[-0.035em]"
          style={{ color: text() }}
        >
          {report ? report.headline : "Aapke bachche ki padhai"}
        </h1>
      </header>

      {message && (
        <Panel className="p-4">
          <p className="text-[14px]" style={{ color: text(0.75) }}>
            {message}
          </p>
        </Panel>
      )}

      {report ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Sessions" value={String(report.sessions)} />
            <Stat label="Minute" value={String(report.minutes)} />
            <Stat
              label="Sahi jawab"
              value={
                report.questions.accuracy === null ? "—" : `${report.questions.accuracy}%`
              }
            />
          </div>

          {/* The line that matters. Given its own panel and the accent colour
              because it is the only part of the page that asks for anything. */}
          <Panel className="p-5" style={{ background: acc(0.09) }}>
            <p className="text-[15px] font-semibold" style={{ color: text(0.92) }}>
              {report.action}
            </p>
            {report.commonMistake && (
              <p className="mt-1.5 text-[14px]" style={{ color: text(0.7) }}>
                Sabse aam galti: {report.commonMistake.name} ({report.commonMistake.times}{" "}
                baar). {report.commonMistake.fix}
              </p>
            )}
          </Panel>

          <div className="grid gap-3 sm:grid-cols-2">
            <Panel className="space-y-2 p-4">
              <p
                className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ color: text(0.45) }}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Achha chal raha hai
              </p>
              {report.strong.length === 0 ? (
                <p className="text-[14px]" style={{ color: text(0.55) }}>
                  Abhi shuruaat hai.
                </p>
              ) : (
                report.strong.map((topic) => (
                  <p key={topic.topic} className="text-[14px]" style={{ color: text(0.8) }}>
                    {topic.topic} · {topic.score}/100
                  </p>
                ))
              )}
            </Panel>

            <Panel className="space-y-2 p-4">
              <p
                className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ color: text(0.45) }}
              >
                <TrendingDown className="h-3.5 w-3.5" />
                Dhyan chahiye
              </p>
              {report.weak.length === 0 ? (
                <p className="text-[14px]" style={{ color: text(0.55) }}>
                  Kuch khaas nahi.
                </p>
              ) : (
                report.weak.map((topic) => (
                  <p key={topic.topic} className="text-[14px]" style={{ color: text(0.8) }}>
                    {topic.topic} · {topic.score}/100
                  </p>
                ))
              )}
            </Panel>
          </div>

          <p className="text-[12px]" style={{ color: text(0.45) }}>
            Bachche ki tutor se hui baat-cheet yahan nahi dikhti. Wo jaan-bujhkar
            hai — bacche tabhi khulkar poochhte hain jab unhe pata ho ki koi
            padh nahi raha, aur khulkar poochhna hi seekhne ka tareeka hai. Poora
            data kanoonan aapka hai aur Privacy page se download kiya ja sakta
            hai.
          </p>
        </>
      ) : (
        <Panel className="space-y-4 p-5">
          <div>
            <h2 className="text-[16px] font-bold" style={{ color: text(0.9) }}>
              Apne bachche ka account jodiye
            </h2>
            <p className="mt-1.5 text-[14px]" style={{ color: text(0.65) }}>
              Unka email ya phone number daaliye. Wo apne account se confirm
              karenge, uske baad har hafte progress report aapko milegi.
            </p>
          </div>

          <form onSubmit={link} className="flex gap-2">
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
              placeholder="email ya 98765 43210"
              className="flex-1 rounded-xl px-4 py-2.5 text-[15px] outline-none"
              style={{ background: text(0.04), border: `1px solid ${text(0.1)}`, color: text(0.9) }}
            />
            <Button type="submit" disabled={linking} className="px-4">
              {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Jodo"}
            </Button>
          </form>

          {children.some((child) => !child.confirmed) && (
            <p className="text-[13px]" style={{ color: text(0.6) }}>
              Ek request bheji ja chuki hai aur student ke confirm karne ka
              intezaar hai.
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Panel className="p-4">
      <p className="font-display text-2xl font-extrabold" style={{ color: text() }}>
        {value}
      </p>
      <p className="mt-0.5 text-[12px]" style={{ color: text(0.5) }}>
        {label}
      </p>
    </Panel>
  );
}
