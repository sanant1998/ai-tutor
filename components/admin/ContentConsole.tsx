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

const STATUSES = ["draft", "in_review", "approved", "published", "rejected"] as const;

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
  const [filter, setFilter] = useState<string>("in_review");
  const [selected, setSelected] = useState<Draft | null>(null);
  const [editor, setEditor] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [counts, setCounts] = useState<{ modelDrafted: number; total: number } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/admin/content${filter === "all" ? "" : `?status=${filter}`}`,
    );
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error ?? "Could not load drafts.");
      return;
    }

    setDrafts(payload.drafts ?? []);
    setCounts(payload.counts ?? null);
  }, [filter]);

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

  return (
    <main className="mx-auto max-w-[1400px] px-5 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] opacity-50">
            Content
          </p>
          <h1 className="font-display mt-1 text-[1.8rem] font-extrabold tracking-[-0.03em]">
            Review queue
          </h1>
          <p className="mt-1 text-[13px] opacity-55">
            Reviewing as {reviewer}
            {!superAdmin &&
              ` · ${orgIds.length === 1 ? "your organisation" : `${orgIds.length} organisations`}`}
            {counts
              ? ` · ${counts.modelDrafted} of ${counts.total} shown were model-drafted`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          >
            <option value="all">All</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <Button type="button" onClick={() => void load()} className="px-3">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {message && (
        <p className="mb-4 rounded-xl bg-black/5 px-4 py-3 text-[14px] dark:bg-white/10">
          {message}
        </p>
      )}

      {/* Its own row rather than a header control: collapsed it is one button,
          and open it is a full-width editor. Inside the header's flex group the
          expanded panel would be squeezed into a column. */}
      <div className="mb-5">
        <UploadDraft canAuthor={canAuthor} onUploaded={() => void load()} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          {drafts.length === 0 && (
            <p className="text-[14px] opacity-55">Nothing in this state.</p>
          )}

          {drafts.map((draft) => {
            const errors = (draft.issues ?? []).filter(
              (issue) => issue.severity === "error",
            ).length;

            return (
              <button
                key={draft.id}
                type="button"
                onClick={() => void open(draft)}
                className={`w-full rounded-xl border p-3 text-left transition-opacity hover:opacity-80 ${
                  selected?.id === draft.id
                    ? "border-black/30 dark:border-white/30"
                    : "border-black/10 dark:border-white/10"
                }`}
              >
                <p className="text-[14px] font-semibold">
                  {draft.entity_id ?? `new ${draft.entity_type}`}
                </p>
                <p className="mt-0.5 text-[12px] opacity-55">
                  {draft.entity_type} · {draft.status} · v{draft.version}
                </p>
                <p className="mt-1 text-[11px] opacity-45">
                  {draft.generated_by}
                  {/* Only the vendor sees a mixed queue, and only the vendor
                      can publish into the shared base — so the distinction
                      between "shared" and one customer's material is the thing
                      to get wrong here, and it is worth a label. */}
                  {superAdmin &&
                    ` · ${draft.org_id ? `org ${draft.org_id.slice(0, 8)}` : "shared base"}`}
                </p>
                {errors > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-[12px] text-red-600 dark:text-red-400">
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

            <p className="text-[12px] opacity-50">
              Publishing writes a new version. Content already published is never
              edited in place — a session in progress keeps the material it
              started with.
            </p>
          </section>
        ) : (
          <section className="rounded-xl border border-black/10 p-8 dark:border-white/10">
            <p className="text-[14px] opacity-60">
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
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-45">
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
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] opacity-45">
            Hook
          </p>
          <TutorMessage body={String(payload.hook)} />
        </div>
      )}

      {misconceptions.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] opacity-45">
            Misconceptions ({misconceptions.length})
          </p>
          <ul className="space-y-2">
            {misconceptions.map((misconception) => (
              <li key={misconception.id} className="text-[13px]">
                <span className="font-mono opacity-50">{misconception.id}</span>{" "}
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
