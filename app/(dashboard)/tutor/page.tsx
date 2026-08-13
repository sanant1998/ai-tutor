/* What is actually seeded, and whether the student may open it.
 *
 * Rendered on the server because the answer depends on the student's mastery
 * rows and there is no reason to ship that decision to the browser and let it
 * flash "locked" for a moment first. */

import Link from "next/link";
import { Dumbbell, Lock, Play, RotateCcw, Target } from "lucide-react";

import { LanguagePicker } from "@/components/app/LanguagePicker";
import { PageHeader, Panel } from "@/components/app/ui";
import { dueTopics } from "@/lib/pedagogy/mastery";
import { scoped, visibleTo } from "@/lib/tenancy";
import { LIMITS, topicUnlocked } from "@/lib/pedagogy/beats";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TopicCard = {
  id: string;
  title: string;
  chapter: string;
  concepts: number;
  questions: number;
  score: number;
  band: string;
  unlocked: boolean;
  blockedBy: string[];
};

export default async function TutorIndexPage() {
  if (!isAdminConfigured()) {
    return (
      <div className="space-y-6">
        <PageHeader kicker="Tutor" title="One-to-one teaching" />
        <Panel className="p-6">
          <p className="text-[15px] opacity-70">
            The tutor needs <code>SUPABASE_SERVICE_ROLE_KEY</code> set, and{" "}
            <code>supabase/tutor.sql</code> plus <code>supabase/compliance.sql</code>{" "}
            run on the project. Then seed the curriculum with{" "}
            <code>node scripts/seed-content.ts</code>.
          </p>
        </Panel>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const admin = createAdminClient();

  /* The service-role client bypasses row-level security, so tenancy here is a
     code obligation rather than a policy one. Unscoped, this list would show
     every institute their competitors' curriculum — silently, and the first
     person to notice would be a customer. */
  const visibility = auth.user
    ? await visibleTo(auth.user.id)
    : { orgIds: [], adminOf: [], superAdmin: false };

  const [{ data: topics }, { data: mastery }] = await Promise.all([
    scoped(
      admin
        .from("topics")
        .select(
          "id, title, topic_no, prereq_topic_ids, chapter_ref, org_id, chapters(title, chapter_no)",
        ),
      visibility,
    ).order("topic_no"),
    auth.user
      ? admin.from("topic_mastery").select("topic_ref, score, band").eq("user_id", auth.user.id)
      : Promise.resolve({ data: [] as { topic_ref: string; score: number; band: string }[] }),
  ]);

  const scores: Record<string, number> = {};
  const bands: Record<string, string> = {};
  for (const row of mastery ?? []) {
    scores[row.topic_ref as string] = Number(row.score ?? 0);
    bands[row.topic_ref as string] = (row.band as string) ?? "Not started";
  }

  const titleById = new Map((topics ?? []).map((row) => [row.id as string, row.title as string]));

  /* Counts per topic, so a card can say what is behind it rather than
     promising a lesson that turns out to be two questions long. */
  const [{ data: conceptRows }, { data: questionRows }] = await Promise.all([
    scoped(admin.from("concepts").select("topic_ref, org_id"), visibility),
    scoped(admin.from("bank_questions").select("topic_ref, org_id"), visibility),
  ]);

  const count = (rows: { topic_ref: string }[] | null) => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      map.set(row.topic_ref, (map.get(row.topic_ref) ?? 0) + 1);
    }
    return map;
  };

  const conceptCount = count(conceptRows as { topic_ref: string }[] | null);
  const questionCount = count(questionRows as { topic_ref: string }[] | null);

  const cards: TopicCard[] = (topics ?? []).map((row) => {
    const chapter = row.chapters as unknown as { title?: string } | { title?: string }[] | null;
    const prereqs = (row.prereq_topic_ids as string[]) ?? [];
    const { unlocked, blockedBy } = topicUnlocked(prereqs, scores);

    return {
      id: row.id as string,
      title: row.title as string,
      chapter: (Array.isArray(chapter) ? chapter[0]?.title : chapter?.title) ?? "",
      concepts: conceptCount.get(row.id as string) ?? 0,
      questions: questionCount.get(row.id as string) ?? 0,
      score: Math.round(scores[row.id as string] ?? 0),
      band: bands[row.id as string] ?? "Not started",
      unlocked,
      blockedBy: blockedBy.map((id) => titleById.get(id) ?? id),
    };
  });

  /* What spaced repetition says is due today.
   *
   * Without this surface the SM-2 schedule in lib/pedagogy/mastery.ts computes
   * a next_review_at that nothing ever reads — which is the commonest way a
   * spaced-repetition system ends up being a column rather than a feature.
   * Shown above the topic list because a review that is due beats a new topic
   * every time: the whole point of the interval is that it is the last day the
   * material can be recovered cheaply. */
  const due = auth.user ? await dueTopics(auth.user.id, 5) : [];

  /* Work a teacher has set.
   *
   * The assignments table and the endpoint that writes it existed before this,
   * and nothing read them — a teacher could set a chapter with a deadline and
   * no student would ever see it, which is worse than not having the feature.
   * Read through the student's own client so the RLS policy decides what they
   * can see rather than this query. */
  const { data: assigned } = await supabase
    .from("assignments")
    .select("id, due_on, note, chapter_ref, topic_ref, topics(title), chapters(title)")
    .order("due_on", { nullsFirst: false })
    .limit(5);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Tutor"
        title="One-to-one teaching"
        sub="Har concept ek chhote session me — samjho, check karo, aur atko to alag tareeke se dobara."
        actions={
          <div className="flex items-center gap-2">
            <LanguagePicker />
            <Link
                href="/fix-sheet/tutor"
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[14px]"
              style={{ background: "rgb(var(--fg-rgb) / 0.06)" }}
            >
              <Target className="h-3.5 w-3.5" />
              Fix sheet
            </Link>
          </div>
        }
      />

      {(assigned ?? []).length > 0 && (
        <Panel className="space-y-2 p-5">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] opacity-45">
            Teacher ne diya hai
          </p>

          {(assigned ?? []).map((row) => {
            const topic = row.topics as unknown as { title?: string } | { title?: string }[] | null;
            const chapter = row.chapters as unknown as { title?: string } | { title?: string }[] | null;

            const title =
              (Array.isArray(topic) ? topic[0]?.title : topic?.title) ??
              (Array.isArray(chapter) ? chapter[0]?.title : chapter?.title) ??
              "Assignment";

            const href = row.topic_ref ? `/tutor/${row.topic_ref}` : "/tutor";

            return (
              <Link key={row.id as string} href={href} className="block">
                <p className="text-[15px]">
                  {title}
                  {row.due_on ? (
                    <span className="ml-2 text-[13px] opacity-55">
                      {new Date(row.due_on as string).toLocaleDateString("en-IN")} tak
                    </span>
                  ) : null}
                </p>
                {row.note ? (
                  <p className="text-[13px] opacity-60">{row.note as string}</p>
                ) : null}
              </Link>
            );
          })}
        </Panel>
      )}

      {due.length > 0 && (
        <Panel className="space-y-3 p-5">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] opacity-45">
            Aaj dohraana hai
          </p>

          <p className="text-[14px] opacity-65">
            Ye topics tumne pehle kiye the. Aaj wahi din hai jab dohraane se sabse
            zyada yaad rehta hai.
          </p>

          <div className="flex flex-wrap gap-2">
            {due.map((topic) => (
              <Link
                key={topic.topicId}
                href={`/practice/${topic.topicId}`}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[14px]"
                style={{ background: "rgb(var(--acc-rgb) / 0.12)" }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {topic.title || topic.topicId}
                <span className="opacity-55">{topic.score}/100</span>
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {cards.length === 0 ? (
        <Panel className="p-6">
          <p className="text-[15px] opacity-70">
            Abhi koi topic seed nahi hua. <code>node scripts/seed-content.ts</code> chalao.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((card) => (
            <Panel key={card.id} className="flex flex-col gap-3 p-5">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] opacity-45">
                {card.chapter}
              </p>

              <h2 className="font-display text-lg font-extrabold tracking-[-0.02em]">
                {card.title}
              </h2>

              <p className="text-[13px] opacity-60">
                {card.concepts} concept{card.concepts === 1 ? "" : "s"} · {card.questions} questions ·{" "}
                {card.band}
                {card.score > 0 ? ` (${card.score}/100)` : ""}
              </p>

              {card.unlocked ? (
                <div className="mt-1 flex flex-wrap gap-2">
                  <Link
                    href={`/tutor/${card.id}`}
                    className="inline-flex w-fit items-center gap-2 rounded-xl px-4 py-2 text-[14px] font-semibold"
                    style={{ background: "rgb(var(--acc-rgb) / 0.16)" }}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {card.score > 0 ? "Jaari rakho" : "Shuru karo"}
                  </Link>

                  {/* Practice was reachable only from the end of a session
                      before this, which meant a student who wanted to drill a
                      topic they had already been taught had nowhere to go. */}
                  {card.score > 0 && card.questions > 0 && (
                    <Link
                      href={`/practice/${card.id}`}
                      className="inline-flex w-fit items-center gap-2 rounded-xl px-4 py-2 text-[14px]"
                      style={{ background: "rgb(var(--fg-rgb) / 0.06)" }}
                    >
                      <Dumbbell className="h-3.5 w-3.5" />
                      Practice
                    </Link>
                  )}
                </div>
              ) : (
                <p className="mt-1 inline-flex items-center gap-2 text-[13px] opacity-55">
                  <Lock className="h-3.5 w-3.5" />
                  Pehle {card.blockedBy.join(", ")} me {LIMITS.unlockScore}+ karo
                </p>
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
