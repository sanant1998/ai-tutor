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
import { AlertCircle, ClipboardList, Loader2, Megaphone, NotebookPen, Users } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { acc, text } from "@/lib/theme";

type Student = {
  id: string;
  name: string;
  score: number;
  topicsDone: number;
  lastActive: string | null;
  state: "red" | "amber" | "green";
  /* What the school calls this child. Null until the office enters a record,
     which on day one is everybody. */
  admissionNumber: string | null;
  rollNumber: string | null;
  /* Last year's section, when they were promoted into this one. */
  cameFrom: string | null;
};

type TestRow = {
  id: string;
  title: string;
  kind: string;
  status: string;
  attempts: number;
  submitted: number;
  average: number | null;
  outOf: number | null;
};

type Chapter = { ref: string; title: string };

type Submission = {
  id: string;
  name: string;
  content: string | null;
  submittedAt: string;
  marks: number | null;
  status: string;
};

type Homework = {
  id: string;
  note: string | null;
  dueOn: string | null;
  maxMarks: number | null;
  submitted: number;
  marked: number;
  submissions: Submission[];
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
  red: "Needs attention",
  amber: "Coming along",
  green: "Doing well",
};

export function TeacherView({ sectionId }: { sectionId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [heatmap, setHeatmap] = useState<HeatRow[]>([]);
  const [sectionName, setSectionName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [notice, setNotice] = useState({ title: "", body: "" });
  const [sending, setSending] = useState(false);
  const [tests, setTests] = useState<TestRow[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [draft, setDraft] = useState({ chapterRef: "", count: "10", publish: false });
  const [setting, setSetting] = useState(false);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [marking, setMarking] = useState("");
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [task, setTask] = useState({ chapterRef: "", note: "", dueOn: "", maxMarks: "" });
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
          setError(payload.error ?? "That could not be loaded.");
          return;
        }

        setStudents(payload.students ?? []);
        setHeatmap(payload.heatmap ?? []);
        setSectionName(payload.section?.name ?? "");
        setOrgId(payload.section?.orgId ?? "");
        setTests(payload.tests ?? []);
        setChapters(payload.chapters ?? []);

        /* Homework is a second request rather than more fields on the first.
           It is the only part of this screen a teacher acts ON — the rest is
           read — and a grading inbox that made the heatmap wait for it would
           slow down the screen that gets opened every morning. */
        void (async () => {
          try {
            const inbox = await fetch(`/api/teacher/submissions?sectionId=${sectionId}`);
            if (!inbox.ok) return;
            const payloadInbox = await inbox.json();
            if (live) setHomework(payloadInbox.assignments ?? []);
          } catch {
            /* The section screen is still worth showing without it. */
          }
        })();
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
        <span className="text-[14px]">Loading the class…</span>
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
          {students.length} students · {needAttention} need attention
        </p>
      </header>

      {/* The heatmap first. This is the screen that changes what a teacher
          does tomorrow morning. */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-extrabold" style={{ color: text() }}>
          Where the whole class is stuck
        </h2>

        {heatmap.length === 0 ? (
          <Panel className="p-5">
            <p className="text-[14px]" style={{ color: text(0.6) }}>
              Not enough data yet. This fills in once students have worked
              through a few topics.
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
                      <span className="font-semibold">Most common wrong belief:</span>{" "}
                      {row.commonBelief.belief}
                    </p>
                    <p className="mt-1 text-[13px]" style={{ color: text(0.62) }}>
                      Correct this in tomorrow’s class: {row.commonBelief.correction}
                    </p>
                  </div>
                )}
              </Panel>
            ))}
          </div>
        )}
      </section>

      {/* Setting a test: a chapter and a number, not a question picker.
          A teacher doing this on Thursday evening wants "chapter 3, twelve
          questions, done" — reading forty stems and ticking twelve is the
          builder that gets used once. The bank already knows which questions
          belong to the chapter and how hard each one is. */}
      {chapters.length > 0 && (
        <section className="space-y-3">
          <h2
            className="font-display flex items-center gap-2 text-lg font-extrabold"
            style={{ color: text() }}
          >
            <ClipboardList className="h-4 w-4" />
            Set a test
          </h2>

          <Panel className="space-y-3 p-4">
            <div className="grid gap-2 sm:grid-cols-[1fr_110px]">
              <select
                value={draft.chapterRef}
                onChange={(event) => setDraft({ ...draft, chapterRef: event.target.value })}
                className="rounded-xl border bg-transparent px-3 py-2 text-[14px]"
                style={{ borderColor: text(0.15), color: text(0.9) }}
              >
                <option value="">Choose a chapter…</option>
                {chapters.map((chapter) => (
                  <option key={chapter.ref} value={chapter.ref}>
                    {chapter.title}
                  </option>
                ))}
              </select>

              <input
                value={draft.count}
                onChange={(event) => setDraft({ ...draft, count: event.target.value })}
                inputMode="numeric"
                aria-label="How many questions"
                className="rounded-xl border bg-transparent px-3 py-2 text-[14px]"
                style={{ borderColor: text(0.15), color: text(0.9) }}
              />
            </div>

            <label className="flex items-center gap-2 text-[13.5px]" style={{ color: text(0.7) }}>
              <input
                type="checkbox"
                checked={draft.publish}
                onChange={(event) => setDraft({ ...draft, publish: event.target.checked })}
                className="h-4 w-4"
              />
              Give it to the class now
            </label>

            <button
              type="button"
              disabled={setting || !draft.chapterRef}
              onClick={async () => {
                setSetting(true);
                setError("");

                try {
                  const response = await fetch("/api/teacher/tests", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      sectionId,
                      chapterRef: draft.chapterRef,
                      questionCount: Number(draft.count) || 10,
                      publish: draft.publish,
                    }),
                  });

                  const payload = await response.json();

                  if (!response.ok) {
                    setError(payload.error ?? "The test could not be set.");
                    return;
                  }

                  /* Said when the bank could not fill the request. The teacher
                     asked for twelve and is about to set nine, and finding
                     that out from the paper on Friday is worse. */
                  setError(
                    payload.shortBy
                      ? `${payload.questions} questions set — that is all this chapter has.`
                      : "",
                  );

                  setTests((current) => [
                    {
                      id: payload.id,
                      title: chapters.find((c) => c.ref === draft.chapterRef)?.title ?? "Test",
                      kind: "quiz",
                      status: payload.status,
                      attempts: 0,
                      submitted: 0,
                      average: null,
                      outOf: payload.questions,
                    },
                    ...current,
                  ]);

                  setDraft({ chapterRef: "", count: "10", publish: false });
                } catch {
                  setError("Network problem.");
                } finally {
                  setSetting(false);
                }
              }}
              className="rounded-xl px-4 py-2 text-[14px] font-bold disabled:opacity-50"
              style={{ background: acc(0.14), color: text(0.9) }}
            >
              {setting ? "Building…" : draft.publish ? "Set and send" : "Save as draft"}
            </button>

            <p className="text-[12px]" style={{ color: text(0.5) }}>
              Questions are picked automatically — a third easy, a third middling, the rest hard.
              A draft is not visible to the class until you send it.
            </p>
          </Panel>
        </section>
      )}

      {/* Tests, between the heatmap and the register. Nothing when the class
          has none — an empty "no tests" panel on every teacher's screen for the
          months before tests are used is furniture, and furniture gets ignored
          along with whatever appears in it later. */}
      {tests.length > 0 && (
        <section className="space-y-3">
          <h2
            className="font-display flex items-center gap-2 text-lg font-extrabold"
            style={{ color: text() }}
          >
            <ClipboardList className="h-4 w-4" />
            Tests
          </h2>

          <Panel className="divide-y" style={{ borderColor: text(0.08) }}>
            {tests.map((test) => (
              <div key={test.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[15px]" style={{ color: text(0.9) }}>
                    {test.title}
                    {test.status !== "published" && (
                      <span className="ml-2 text-[12px]" style={{ color: text(0.45) }}>
                        {test.status}
                      </span>
                    )}
                  </p>

                  <span className="font-mono text-[13px]" style={{ color: text(0.7) }}>
                    {test.average !== null
                      ? `${test.average}${test.outOf ? `/${test.outOf}` : ""} average`
                      : "no marks yet"}
                  </span>
                </div>

                <p className="mt-1 text-[12px]" style={{ color: text(0.5) }}>
                  {/* Started versus finished, because a test thirty children
                      opened and four finished is a different problem from one
                      nobody opened — and the average hides both. */}
                  {test.submitted} of {test.attempts || students.length} finished
                  {test.attempts > test.submitted &&
                    ` · ${test.attempts - test.submitted} left unfinished`}
                </p>
              </div>
            ))}
          </Panel>
        </section>
      )}

      {/* A notice to this class.
          The endpoint has always allowed it — /api/announcements checks
          teaches_section() for exactly this case — and the only form was in
          the admin console, which a teacher cannot open. So the rule existed
          and the box did not: "test kal hai, chapter 3 padh ke aana" had to go
          through the school office. */}
      {orgId && (
        <section className="space-y-3">
          <h2
            className="font-display flex items-center gap-2 text-lg font-extrabold"
            style={{ color: text() }}
          >
            <Megaphone className="h-4 w-4" />
            Send the class a notice
          </h2>

          <Panel className="space-y-3 p-4">
            <input
              value={notice.title}
              onChange={(event) => setNotice({ ...notice, title: event.target.value })}
              placeholder="One line — it will be read on a phone"
              className="w-full rounded-xl border bg-transparent px-3 py-2 text-[14px]"
              style={{ borderColor: text(0.15), color: text(0.9) }}
            />

            <textarea
              value={notice.body}
              onChange={(event) => setNotice({ ...notice, body: event.target.value })}
              rows={2}
              placeholder="The rest of it"
              className="w-full rounded-xl border bg-transparent p-3 text-[14px]"
              style={{ borderColor: text(0.15), color: text(0.9) }}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px]" style={{ color: text(0.5) }}>
                This section only. Notices to the whole school are sent by the school admin.
              </p>

              <button
                type="button"
                disabled={sending || !notice.title.trim() || !notice.body.trim()}
                onClick={async () => {
                  setSending(true);
                  setError("");

                  try {
                    const response = await fetch("/api/announcements", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        orgId,
                        sectionId,
                        audience: "section",
                        title: notice.title,
                        body: notice.body,
                      }),
                    });

                    if (!response.ok) {
                      const payload = await response.json();
                      setError(payload.error ?? "The notice was not sent.");
                      return;
                    }

                    setNotice({ title: "", body: "" });
                  } catch {
                    setError("Network problem.");
                  } finally {
                    setSending(false);
                  }
                }}
                className="rounded-xl px-4 py-2 text-[14px] font-bold disabled:opacity-50"
                style={{ background: acc(0.14), color: text(0.9) }}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </Panel>
        </section>
      )}

      {/* Setting homework. Same shape as the test form above it — a chapter
          and a date — because they are the same decision at two sizes, and a
          teacher who has learned one should not have to learn the other. */}
      {chapters.length > 0 && (
        <section className="space-y-3">
          <h2
            className="font-display flex items-center gap-2 text-lg font-extrabold"
            style={{ color: text() }}
          >
            <NotebookPen className="h-4 w-4" />
            Set homework
          </h2>

          <Panel className="space-y-3 p-4">
            <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
              <select
                value={task.chapterRef}
                onChange={(event) => setTask({ ...task, chapterRef: event.target.value })}
                className="rounded-xl border bg-transparent px-3 py-2 text-[14px]"
                style={{ borderColor: text(0.15), color: text(0.9) }}
              >
                <option value="">Choose a chapter…</option>
                {chapters.map((chapter) => (
                  <option key={chapter.ref} value={chapter.ref}>
                    {chapter.title}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={task.dueOn}
                onChange={(event) => setTask({ ...task, dueOn: event.target.value })}
                aria-label="Due date"
                className="rounded-xl border bg-transparent px-3 py-2 text-[14px]"
                style={{ borderColor: text(0.15), color: text(0.9) }}
              />
            </div>

            <input
              value={task.note}
              onChange={(event) => setTask({ ...task, note: event.target.value })}
              placeholder="What to do — one line"
              className="w-full rounded-xl border bg-transparent px-3 py-2 text-[14px]"
              style={{ borderColor: text(0.15), color: text(0.9) }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={task.maxMarks}
                onChange={(event) => setTask({ ...task, maxMarks: event.target.value })}
                inputMode="numeric"
                placeholder="Marks"
                aria-label="Marks"
                className="w-24 rounded-xl border bg-transparent px-3 py-2 text-[14px]"
                style={{ borderColor: text(0.15), color: text(0.9) }}
              />

              <button
                type="button"
                disabled={setting || !task.chapterRef}
                onClick={async () => {
                  setSetting(true);
                  setError("");

                  try {
                    const response = await fetch("/api/teacher/assignments", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        sectionId,
                        chapterRef: task.chapterRef,
                        note: task.note,
                        dueOn: task.dueOn || null,
                        maxMarks: task.maxMarks ? Number(task.maxMarks) : null,
                      }),
                    });

                    const payload = await response.json();

                    if (!response.ok) {
                      setError(payload.error ?? "The homework could not be set.");
                      return;
                    }

                    setHomework((current) => [
                      {
                        id: payload.id,
                        note: task.note || null,
                        dueOn: task.dueOn || null,
                        maxMarks: task.maxMarks ? Number(task.maxMarks) : null,
                        submitted: 0,
                        marked: 0,
                        submissions: [],
                      },
                      ...current,
                    ]);

                    setTask({ chapterRef: "", note: "", dueOn: "", maxMarks: "" });
                  } catch {
                    setError("Network problem.");
                  } finally {
                    setSetting(false);
                  }
                }}
                className="rounded-xl px-4 py-2 text-[14px] font-bold disabled:opacity-50"
                style={{ background: acc(0.14), color: text(0.9) }}
              >
                {setting ? "Building…" : "Set homework"}
              </button>
            </div>

            <p className="text-[12px]" style={{ color: text(0.5) }}>
              The class sees it straight away, and a notification appears on their dashboard.
            </p>
          </Panel>
        </section>
      )}

      {/* Homework coming back. Only the unmarked work is expanded: a teacher
          opening this at 9pm wants the pile, not an archive of what they have
          already done. */}
      {homework.length > 0 && (
        <section className="space-y-3">
          <h2
            className="font-display flex items-center gap-2 text-lg font-extrabold"
            style={{ color: text() }}
          >
            <NotebookPen className="h-4 w-4" />
            Homework
          </h2>

          {homework.map((assignment) => (
            <Panel key={assignment.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-semibold" style={{ color: text(0.9) }}>
                  {assignment.note ?? "Homework"}
                </h3>
                <span className="text-[13px]" style={{ color: text(0.55) }}>
                  {assignment.submitted} in · {assignment.marked} marked
                </span>
              </div>

              {assignment.submissions
                .filter((submission) => submission.status !== "graded")
                .map((submission) => (
                  <div
                    key={submission.id}
                    className="space-y-2 rounded-xl px-3 py-3"
                    style={{ background: text(0.04) }}
                  >
                    <p className="text-[14px] font-semibold" style={{ color: text(0.85) }}>
                      {submission.name}
                    </p>

                    <p className="whitespace-pre-wrap text-[13.5px]" style={{ color: text(0.7) }}>
                      {submission.content}
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={marks[submission.id] ?? ""}
                        onChange={(event) =>
                          setMarks((current) => ({ ...current, [submission.id]: event.target.value }))
                        }
                        inputMode="numeric"
                        placeholder={assignment.maxMarks ? `0–${assignment.maxMarks}` : "Marks"}
                        aria-label={`Marks for ${submission.name}`}
                        className="w-24 rounded-xl bg-transparent px-3 py-2 text-[14px]"
                        style={{ border: `1px solid ${text(0.15)}`, color: text(0.9) }}
                      />

                      <button
                        type="button"
                        disabled={marking === submission.id || !marks[submission.id]}
                        onClick={async () => {
                          setMarking(submission.id);

                          try {
                            const response = await fetch("/api/teacher/submissions", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                submissionId: submission.id,
                                marks: Number(marks[submission.id]),
                              }),
                            });

                            if (!response.ok) {
                              const payload = await response.json();
                              setError(payload.error ?? "The marks were not saved.");
                              return;
                            }

                            /* Removed from the pile rather than refetched: the
                               teacher is working down a list and a reordering
                               list loses their place. */
                            setHomework((current) =>
                              current.map((entry) =>
                                entry.id === assignment.id
                                  ? {
                                      ...entry,
                                      marked: entry.marked + 1,
                                      submissions: entry.submissions.map((row) =>
                                        row.id === submission.id
                                          ? { ...row, status: "graded" }
                                          : row,
                                      ),
                                    }
                                  : entry,
                              ),
                            );
                          } finally {
                            setMarking("");
                          }
                        }}
                        className="rounded-xl px-3 py-2 text-[13.5px] font-bold disabled:opacity-40"
                        style={{ background: acc(0.14), color: text(0.9) }}
                      >
                        {marking === submission.id ? "Saving…" : "Save marks"}
                      </button>
                    </div>
                  </div>
                ))}

              {assignment.submitted === 0 && (
                <p className="text-[13px]" style={{ color: text(0.5) }}>
                  Nobody has submitted yet.
                </p>
              )}

              {assignment.submitted > 0 && assignment.submitted === assignment.marked && (
                <p className="text-[13px]" style={{ color: text(0.5) }}>
                  All marked.
                </p>
              )}
            </Panel>
          ))}
        </section>
      )}

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
                    {/* Roll number first, the way a register reads and the way
                        a teacher calls a class. Absent until the office enters
                        the record, so it is a prefix rather than a column that
                        would sit empty for half the list. */}
                    {student.rollNumber && (
                      <span className="font-mono text-[13px]" style={{ color: text(0.45) }}>
                        {student.rollNumber}.{" "}
                      </span>
                    )}
                    {student.name}
                  </p>
                  <p className="text-[12px]" style={{ color: text(0.5) }}>
                    {student.admissionNumber && `${student.admissionNumber} · `}
                    {/* Where they came up from. A teacher meeting a class in
                        April wants to know whether these children came up
                        together or arrived from four different sections. */}
                    {student.cameFrom && `from ${student.cameFrom} · `}
                    {student.topicsDone} topics done ·{" "}
                    {student.lastActive
                      ? `last active ${daysAgo(student.lastActive)}`
                      : "has not started yet"}
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
              <p className="text-[14px]">No students in this section yet.</p>
            </div>
          )}
        </Panel>

        <p className="text-[12px]" style={{ color: text(0.45) }}>
          You can see the class’s progress. No student’s conversation with the
          tutor is shown — children only ask openly when they know nobody is
          reading along.
        </p>
      </section>
    </div>
  );
}

function daysAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
