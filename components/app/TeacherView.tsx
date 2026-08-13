"use client";

/* The teacher's two screens, on one page.
 *
 * The heatmap is first, not the student list. That ordering is the whole
 * argument for the product in a school: a list of forty names with scores is
 * something the school's existing system already gives them, and a line saying
 * "eleven students in this class think additive inverse means flip it" is not.
 *
 * The class list is second and is sorted weakest first, because a teacher
 * scanning it is looking for who to speak to and not for a leaderboard. */

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Users } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { acc, text } from "@/lib/theme";

type Student = {
  id: string;
  name: string;
  score: number;
  topicsDone: number;
  lastActive: string | null;
  state: "red" | "amber" | "green";
};

type HeatRow = {
  topicId: string;
  title: string;
  classAverage: number;
  struggling: number;
  attempted: number;
  commonBelief: { belief: string; correction: string } | null;
};

const STATE_COLOUR: Record<Student["state"], string> = {
  red: "#dc2626",
  amber: "#d97706",
  green: "#16a34a",
};

const STATE_LABEL: Record<Student["state"], string> = {
  red: "Dhyan chahiye",
  amber: "Theek chal raha hai",
  green: "Achha",
};

export function TeacherView({ sectionId }: { sectionId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [heatmap, setHeatmap] = useState<HeatRow[]>([]);
  const [sectionName, setSectionName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;

    (async () => {
      try {
        const response = await fetch(`/api/teacher/section/${sectionId}`);
        const payload = await response.json();

        if (!live) return;

        if (!response.ok) {
          setError(payload.error ?? "Load nahi ho paaya.");
          return;
        }

        setStudents(payload.students ?? []);
        setHeatmap(payload.heatmap ?? []);
        setSectionName(payload.section?.name ?? "");
      } catch {
        if (live) setError("Network problem.");
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, [sectionId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12" style={{ color: text(0.5) }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-[14px]">Class load ho rahi hai…</span>
      </div>
    );
  }

  if (error) {
    return (
      <Panel className="p-6">
        <p style={{ color: text(0.7) }}>{error}</p>
      </Panel>
    );
  }

  const needAttention = students.filter((student) => student.state === "red").length;

  return (
    <div className="space-y-6">
      <header>
        <p
          className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: text(0.45) }}
        >
          Class
        </p>
        <h1
          className="font-display mt-2 text-[2rem] font-extrabold tracking-[-0.035em]"
          style={{ color: text() }}
        >
          {sectionName || "Section"}
        </h1>
        <p className="mt-2 text-[14px]" style={{ color: text(0.6) }}>
          {students.length} students · {needAttention} ko dhyan chahiye
        </p>
      </header>

      {/* The heatmap first. This is the screen that changes what a teacher
          does tomorrow morning. */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-extrabold" style={{ color: text() }}>
          Poori class kahan atki hai
        </h2>

        {heatmap.length === 0 ? (
          <Panel className="p-5">
            <p className="text-[14px]" style={{ color: text(0.6) }}>
              Abhi kaafi data nahi hai. Students ke kuch topics karne ke baad ye
              bhar jaayega.
            </p>
          </Panel>
        ) : (
          <div className="space-y-2">
            {heatmap.slice(0, 8).map((row) => (
              <Panel key={row.topicId} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[15px] font-semibold" style={{ color: text(0.9) }}>
                    {row.title}
                  </h3>
                  <span className="text-[13px]" style={{ color: text(0.55) }}>
                    class average {row.classAverage}/100 · {row.struggling} struggling
                  </span>
                </div>

                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: text(0.08) }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(2, Math.min(100, row.classAverage))}%`,
                      background:
                        row.classAverage < 40
                          ? STATE_COLOUR.red
                          : row.classAverage < 65
                            ? STATE_COLOUR.amber
                            : STATE_COLOUR.green,
                    }}
                  />
                </div>

                {row.commonBelief && (
                  <div
                    className="mt-3 rounded-xl px-3 py-2.5"
                    style={{ background: acc(0.1) }}
                  >
                    <p className="text-[13px]" style={{ color: text(0.8) }}>
                      <span className="font-semibold">Sabse aam galat samajh:</span>{" "}
                      {row.commonBelief.belief}
                    </p>
                    <p className="mt-1 text-[13px]" style={{ color: text(0.62) }}>
                      Kal class me yahi theek karein: {row.commonBelief.correction}
                    </p>
                  </div>
                )}
              </Panel>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2
          className="font-display flex items-center gap-2 text-lg font-extrabold"
          style={{ color: text() }}
        >
          <Users className="h-4 w-4" />
          Students
        </h2>

        <Panel className="divide-y" style={{ borderColor: text(0.08) }}>
          {students.map((student) => (
            <div
              key={student.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
              style={{ borderColor: text(0.08) }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: STATE_COLOUR[student.state] }}
                  aria-label={STATE_LABEL[student.state]}
                />
                <div>
                  <p className="text-[15px]" style={{ color: text(0.9) }}>
                    {student.name}
                  </p>
                  <p className="text-[12px]" style={{ color: text(0.5) }}>
                    {student.topicsDone} topics done ·{" "}
                    {student.lastActive
                      ? `last active ${daysAgo(student.lastActive)}`
                      : "abhi tak shuru nahi kiya"}
                  </p>
                </div>
              </div>

              <span className="font-mono text-[14px]" style={{ color: text(0.7) }}>
                {student.score}
              </span>
            </div>
          ))}

          {students.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-6" style={{ color: text(0.55) }}>
              <AlertCircle className="h-4 w-4" />
              <p className="text-[14px]">Is section me abhi koi student nahi hai.</p>
            </div>
          )}
        </Panel>

        <p className="text-[12px]" style={{ color: text(0.45) }}>
          Aap class ka progress dekh sakte hain. Kisi student ki tutor se hui
          baat-cheet nahi dikhti — bachche tabhi khulkar poochhte hain jab unhe
          pata ho ki koi padh nahi raha.
        </p>
      </section>
    </div>
  );
}

function daysAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "aaj";
  if (days === 1) return "kal";
  return `${days} din pehle`;
}
