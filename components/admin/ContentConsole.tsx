"use client";

/* The reviewer's screen: JSON on the left, what a student would see on the
 * right, and the validator's complaints between them.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PREVIEW IS NOT OPTIONAL
 *
 * A reviewer reading raw JSON checks that the fields are filled in. A reviewer
 * looking at the rendered concept checks whether the explanation is any good —
 * which is the only thing that matters and the only thing a validator cannot
 * do. The LaTeX in particular: `\frac{5}{8}` looks fine as a string and is
 * wrong in a dozen ways that are obvious the moment it is typeset.
 *
 * There is no "publish all" and no keyboard shortcut for publishing. Every
 * publish is one deliberate click on one entity, because the thing being
 * changed is what every student in the product gets taught. */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, RefreshCw, X } from "lucide-react";

import { Maths, TutorMessage } from "@/components/app/Maths";
import { UploadDraft } from "@/components/admin/UploadDraft";
import { Info, Quiet } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";

type Issue = { severity: "error" | "warn"; where: string; message: string };

type Draft = {
  id: string;
  entity_type: "concept" | "question";
  entity_id: string | null;
  status: string;
  generated_by: string;
  issues: Issue[];
  version: number;
  created_at: string;
  review_notes: string | null;
  org_id: string | null;
  payload?: Record<string, unknown>;
};

/* What a reviewer actually sorts by.
 *
 * The filter was the five raw values of content_drafts.status, which is the
 * database's vocabulary rather than the reviewer's: "draft" and "in_review"
 * are both "nobody has looked at this yet", and "approved", "published" and
 * "rejected" are all "somebody has". Three buttons answer the only question
 * being asked — what still needs me — and the raw status is still printed on
 * every row for anyone who needs the precise one.
 *
 * Grouped on the client rather than in the route: the queue is capped at a
 * hundred rows, so one fetch of everything is cheaper than three round trips
 * and keeps the counts on this page consistent with each other. */
const UNREVIEWED = ["draft", "in_review"];

const VIEWS = [
  { id: "all", label: "All" },
  { id: "unreviewed", label: "Unreviewed" },
  { id: "reviewed", label: "Reviewed" },
] as const;

type View = (typeof VIEWS)[number]["id"];

export function ContentConsole({
  reviewer,
  superAdmin,
  orgIds,
  canAuthor,
}: {
  reviewer: string;
  /* The vendor's queue mixes every customer together, so each row has to say
     whose it is — otherwise two institutes' drafts of the same chapter are
     indistinguishable. An institute only ever sees its own, so for them the
     label would be noise and the header line says it once instead. */
  superAdmin: boolean;
  orgIds: string[];
  /* Resolved server-side from orgs.can_author. See app/admin/content/page.tsx. */
  canAuthor: boolean;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [view, setView] = useState<View>("unreviewed");
  const [selected, setSelected] = useState<Draft | null>(null);
  const [editor, setEditor] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [counts, setCounts] = useState<{ modelDrafted: number; total: number } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/content");
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error ?? "Could not load drafts.");
      return;
    }

    setDrafts(payload.drafts ?? []);
    setCounts(payload.counts ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (draft: Draft) => {
    setMessage("");
    const response = await fetch(`/api/admin/content/${draft.id}`);
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error ?? "Could not open draft.");
      return;
    }

    setSelected(payload.draft);
    setEditor(JSON.stringify(payload.draft.payload, null, 2));
    setNotes(payload.draft.review_notes ?? "");
  };

  const act = async (action: "save" | "publish" | "reject") => {
    if (!selected) return;

    setBusy(true);
    setMessage("");

    let payload: unknown;

    if (action === "save") {
      try {
        payload = JSON.parse(editor);
      } catch (error) {
        setMessage(`JSON is not valid: ${(error as Error).message}`);
        setBusy(false);
        return;
      }
    }

    try {
      const response = await fetch(`/api/admin/content/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes, payload }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error ?? "Failed.");
        return;
      }

      setMessage(
        action === "publish"
          ? "Published. Sessions already running keep the version they started with."
          : action === "reject"
            ? "Rejected."
            : "Saved.",
      );

      if (action !== "save") setSelected(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  /* Parsed live so the preview follows the editor rather than the last save.
     A reviewer who has to save before seeing what they did will stop looking. */
  let parsed: Record<string, unknown> | null = null;
  let parseError = "";

  try {
    parsed = editor ? (JSON.parse(editor) as Record<string, unknown>) : null;
  } catch (error) {
    parseError = (error as Error).message;
  }

  /* Grouped here so the list, the count and the empty state can never
     disagree about what is on screen. */
  const shown = drafts.filter((draft) =>
    view === "all"
      ? true
      : view === "unreviewed"
        ? UNREVIEWED.includes(draft.status)
        : !UNREVIEWED.includes(draft.status),
  );

  const unreviewed = drafts.filter((draft) => UNREVIEWED.includes(draft.status)).length;

  return (
    <main className="mx-auto max-w-[1400px]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#667085]">
            Content
          </p>
          <h1 className="mt-1 text-[1.9rem] font-extrabold tracking-[-0.03em] text-[#0d1015]">
            Review queue
          </h1>
          <p className="mt-1.5 text-[14px] text-[#4b5565]">
            Reviewing as {reviewer}
            {!superAdmin &&
              ` · ${orgIds.length === 1 ? "your organisation" : `${orgIds.length} organisations`}`}
            {counts
              ? ` · ${counts.modelDrafted} of ${counts.total} shown were model-drafted`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="tablist"
            aria-label="Which drafts to show"
            className="flex items-center gap-0.5 rounded-xl border border-[#e4e6ea] bg-white p-1"
          >
            {VIEWS.map((option) => {
              const active = option.id === view;

              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(option.id)}
                  className={`rounded-lg px-4 py-1.5 text-[13.5px] font-semibold transition-colors ${
                    active
                      ? "bg-[#eff4ff] text-[#2563eb]"
                      : "text-[#4b5565] hover:bg-black/[0.035]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <Quiet onClick={() => void load()} aria-label="Refresh" className="px-2.5 py-2">
            <RefreshCw className="h-4 w-4" />
          </Quiet>
        </div>
      </header>

      {message && (
        <p className="mt-5 rounded-xl border border-[#d6e4ff] bg-[#f4f8ff] px-4 py-3 text-[14px] text-[#1e40af]">
          {message}
        </p>
      )}

      <p className="mt-6 flex items-center gap-2 text-[14px] text-[#4b5565]">
        Showing
        <span className="rounded-full bg-[#eff4ff] px-2.5 py-0.5 text-[13px] font-bold text-[#2563eb]">
          {shown.length}
        </span>
        {view === "all" ? "drafts" : view === "unreviewed" ? "unreviewed" : "reviewed"}
        {view !== "unreviewed" && unreviewed > 0 && (
          <span className="text-[#667085]">· {unreviewed} still unreviewed</span>
        )}
      </p>

      <div className="mt-4">
        <Info>
          <p>
            Review everything people report or flag. A model catches some of it; a person sees
            all of it. Start with what is not reviewed, and if the model was unsure, the call is
            yours.
          </p>
        </Info>
      </div>

      {/* Its own row rather than a header control: collapsed it is one button,
          and open it is a full-width editor. Inside the header's flex group the
          expanded panel would be squeezed into a column. */}
      <div className="mb-5 mt-5">
        <UploadDraft canAuthor={canAuthor} onUploaded={() => void load()} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-2.5">
          {shown.length === 0 && (
            <p className="rounded-2xl border border-[#e9eaee] bg-white p-5 text-[14px] text-[#667085]">
              {view === "unreviewed"
                ? "Nothing waiting. Every draft has been looked at."
                : "Nothing in this state."}
            </p>
          )}

          {shown.map((draft) => {
            const errors = (draft.issues ?? []).filter(
              (issue) => issue.severity === "error",
            ).length;

            return (
              <button
                key={draft.id}
                type="button"
                onClick={() => void open(draft)}
                className={`w-full rounded-2xl border bg-white p-4 text-left transition-colors ${
                  selected?.id === draft.id
                    ? "border-[#2563eb] shadow-[0_0_0_3px_rgba(37,99,235,0.12)]"
                    : "border-[#e9eaee] hover:border-[#cfd4dc]"
                }`}
              >
                <p className="font-mono text-[13.5px] font-bold text-[#0d1015]">
                  {draft.entity_id ?? `new ${draft.entity_type}`}
                </p>
                <p className="mt-1 text-[12.5px] text-[#4b5565]">
                  {draft.entity_type} · {draft.status} · v{draft.version}
                </p>
                <p className="mt-1 text-[11.5px] text-[#667085]">
                  {draft.generated_by}
                  {/* Only the vendor sees a mixed queue, and only the vendor
                      can publish into the shared base — so the distinction
                      between "shared" and one customer's material is the thing
                      to get wrong here, and it is worth a label. */}
                  {superAdmin &&
                    ` · ${draft.org_id ? `org ${draft.org_id.slice(0, 8)}` : "shared base"}`}
                </p>
                {errors > 0 && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#fee2e2] px-2.5 py-1 text-[11.5px] font-bold text-[#b91c1c]">
                    <AlertTriangle className="h-3 w-3" />
                    {errors} error{errors === 1 ? "" : "s"}
                  </p>
                )}
              </button>
            );
          })}
        </aside>

        {selected ? (
          <section className="space-y-4">
            {(selected.issues ?? []).length > 0 && (
              <div className="space-y-1 rounded-xl border border-black/10 p-4 dark:border-white/10">
                {(selected.issues ?? []).map((issue, index) => (
                  <p
                    key={index}
                    className={`text-[13px] ${
                      issue.severity === "error"
                        ? "text-red-600 dark:text-red-400"
                        : "opacity-65"
                    }`}
                  >
                    <span className="font-mono">{issue.severity}</span> {issue.where}:{" "}
                    {issue.message}
                  </p>
                ))}
              </div>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold opacity-70">
                  Payload
                </label>
                <textarea
                  value={editor}
                  onChange={(event) => setEditor(event.target.value)}
                  spellCheck={false}
                  className="h-[520px] w-full rounded-xl border border-black/10 bg-transparent p-3 font-mono text-[12px] leading-relaxed dark:border-white/15"
                />
                {parseError && (
                  <p className="mt-1 text-[12px] text-red-600 dark:text-red-400">
                    {parseError}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-semibold opacity-70">
                  As a student sees it
                </label>
                <div className="h-[520px] overflow-y-auto rounded-xl border border-black/10 p-4 dark:border-white/15">
                  {parsed ? <Preview payload={parsed} /> : <p className="opacity-50">—</p>}
                </div>
              </div>
            </div>

            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Review notes — what you changed, or why this is being rejected."
              className="h-20 w-full rounded-xl border border-black/10 bg-transparent p-3 text-[14px] dark:border-white/15"
            />

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void act("save")} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>

              <Button
                type="button"
                onClick={() => void act("publish")}
                disabled={
                  busy ||
                  Boolean(parseError) ||
                  (selected.issues ?? []).some((issue) => issue.severity === "error")
                }
              >
                <Check className="mr-1.5 h-4 w-4" />
                Approve &amp; publish
              </Button>

              <Button type="button" onClick={() => void act("reject")} disabled={busy}>
                <X className="mr-1.5 h-4 w-4" />
                Reject
              </Button>
            </div>

            <p className="text-[12px] text-[#667085]">
              Publishing writes a new version. Content already published is never
              edited in place — a session in progress keeps the material it
              started with.
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-[#e9eaee] bg-white p-8">
            <p className="text-[14px] text-[#4b5565]">
              Pick a draft to review. Anything with a validation error cannot be
              published until it is fixed.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

/* The rendered view. Deliberately close to the tutor's own rendering — the
   point is to see the LaTeX and the wording exactly as a thirteen-year-old
   will. */
function Preview({ payload }: { payload: Record<string, unknown> }) {
  const isQuestion = "stem" in payload;

  if (isQuestion) {
    const options = (payload.options as { key: string; text: string }[] | undefined) ?? [];

    return (
      <div className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#667085]">
          {String(payload.level ?? "")} · {String(payload.qtype ?? "")}
        </p>

        <TutorMessage body={String(payload.stem ?? "")} />

        {options.map((option) => (
          <p key={option.key} className="text-[14px] opacity-80">
            <span className="font-mono opacity-60">{option.key}.</span>{" "}
            <Maths>{option.text}</Maths>
          </p>
        ))}

        <details className="pt-2">
          <summary className="cursor-pointer text-[13px] opacity-60">Solution</summary>
          <div className="mt-2">
            <TutorMessage body={String(payload.solution ?? "")} />
          </div>
        </details>
      </div>
    );
  }

  const misconceptions =
    (payload.misconceptions as { id: string; wrong_belief: string; correction: string }[]) ?? [];
  const examples =
    (payload.worked_examples as { problem: string; steps: string[]; answer: string }[]) ?? [];

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-extrabold">{String(payload.title ?? "")}</h3>

      <TutorMessage body={String(payload.statement ?? "")} />

      {Boolean(payload.hook) && (
        <div className="rounded-xl bg-black/5 p-3 dark:bg-white/10">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#667085]">
            Hook
          </p>
          <TutorMessage body={String(payload.hook)} />
        </div>
      )}

      {misconceptions.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#667085]">
            Misconceptions ({misconceptions.length})
          </p>
          <ul className="space-y-2">
            {misconceptions.map((misconception) => (
              <li key={misconception.id} className="text-[13px]">
                <span className="font-mono text-[#667085]">{misconception.id}</span>{" "}
                <Maths>{misconception.wrong_belief}</Maths>
                <span className="opacity-65">
                  <Maths>{` → ${misconception.correction}`}</Maths>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {examples.map((example, index) => (
        <div key={index} className="text-[13px]">
          <TutorMessage body={example.problem} />
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 opacity-75">
            {example.steps.map((step, stepIndex) => (
              <li key={stepIndex}>
                <Maths>{step}</Maths>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
