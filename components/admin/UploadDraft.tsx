"use client";

/* Putting content INTO the queue.
 *
 * ---------------------------------------------------------------------------
 * THE HALF THAT WAS MISSING
 *
 * POST /api/admin/content has been complete for a while — it scopes the draft
 * to the author's own organisation through targetOrg, refuses orgs whose
 * licence does not include authoring, runs the content validator and files the
 * result as `in_review` when it is clean or `draft` with the reasons attached
 * when it is not.
 *
 * Nothing in the browser ever called it. The review console listed drafts,
 * opened them and published them, and there was no way to create one: the only
 * routes in were scripts/author-concept.ts printing JSON for someone to curl,
 * or seeding a file from the repository. So a teacher at an institute that had
 * paid for authoring could not add a single question.
 *
 * ---------------------------------------------------------------------------
 * WHY IT TAKES JSON RATHER THAN BEING A FORM
 *
 * A concept has a hook, four misconceptions with four fields each, two worked
 * examples with step arrays, analogies and formulas. As a web form that is
 * forty-odd inputs and a lot of "add another" buttons, and it would still be
 * the wrong shape for the way this content actually gets written — in an
 * editor, or by author-concept.ts, and reviewed as a whole.
 *
 * JSON also means one format everywhere: the file the CLI writes, the file in
 * content/, and what this box accepts are the same thing. A form would be a
 * second representation to keep in step with the first.
 *
 * The trade is that a teacher has to paste well-formed JSON. That is softened
 * where it can be: the file picker takes a .json straight off disk, the parse
 * error names the line, and the validator's complaints come back per field
 * rather than as "invalid".
 *
 * ---------------------------------------------------------------------------
 * IT CANNOT PUBLISH
 *
 * Deliberately. This creates a draft and nothing else — even a clean one only
 * reaches `in_review`. Publishing stays one deliberate click on the review
 * screen, because the thing being changed is what students get taught. */

import { useRef, useState } from "react";
import { AlertTriangle, Check, FileJson, Loader2, Upload } from "lucide-react";

import { ImportChapter } from "@/components/admin/ImportChapter";
import { Button } from "@/components/ui/button";

type Issue = { severity: "error" | "warn"; where: string; message: string };

type Result = {
  draftId: string;
  status: string;
  issues: Issue[];
  blocking: number;
};

const PLACEHOLDER = `{
  "id": "c8-math-ch1-t2-c1",
  "title": "Additive inverse",
  "statement": "…",
  "hook": "…",
  "misconceptions": [ { "id": "m1", "wrong_belief": "…", "why_wrong": "…", "correction": "…", "probe": "…" } ],
  "worked_examples": [ { "id": "w1", "problem": "…", "steps": ["…"], "answer": "…" } ]
}`;

export function UploadDraft({
  canAuthor,
  onUploaded,
}: {
  /* False for an organisation whose licence is "use the vendor's content".
     The API refuses these anyway; the box is hidden rather than offered and
     then rejected. */
  canAuthor: boolean;
  onUploaded: () => void;
}) {
  const [open, setOpen] = useState(false);
  /* The PDF import is the way in; JSON is for the platform team and for
     whatever author-concept.ts printed. A teacher never opens it. */
  const [mode, setMode] = useState<"chapter" | "json">("chapter");
  const [entityType, setEntityType] = useState<"concept" | "question">("concept");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!canAuthor) return null;

  const readFile = async (file: File) => {
    setError("");
    setResult(null);

    const contents = await file.text();
    setText(contents);

    /* Guessed from the shape, not from the filename. A file with
       misconceptions in it is a concept whatever it is called, and getting
       this wrong sends the payload through the wrong validator. */
    try {
      const parsed = JSON.parse(contents) as Record<string, unknown>;
      if ("stem" in parsed || "qtype" in parsed) setEntityType("question");
      else if ("misconceptions" in parsed || "hook" in parsed) setEntityType("concept");
    } catch {
      /* Leave the choice alone; the parse error shows on submit. */
    }
  };

  const submit = async () => {
    setError("");
    setResult(null);

    let payload: Record<string, unknown>;

    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch (parseError) {
      setError(`That is not valid JSON — ${(parseError as Error).message}`);
      return;
    }

    if (Array.isArray(payload)) {
      setError(
        "One entity at a time. A whole content pack goes through scripts/seed-content.ts; this box takes a single concept or question.",
      );
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          /* The entity's own id, so a later upload of the same concept is a new
             version of it rather than a second copy. */
          entityId: typeof payload.id === "string" ? payload.id : null,
          generatedBy: "human",
          payload,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "Upload failed.");
        return;
      }

      setResult(body as Result);
      setText("");
      if (fileInput.current) fileInput.current.value = "";
      onUploaded();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button type="button" variant="glass" onClick={() => setOpen(true)} className="px-3">
        <Upload className="h-4 w-4" />
        Add content
      </Button>
    );
  }

  return (
    <section className="mb-5 rounded-2xl border border-black/10 p-5 dark:border-white/15">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold">
            {mode === "chapter" ? "Upload a chapter" : "Paste one concept or question"}
          </h2>
          <p className="mt-0.5 text-[13px] text-[#667085]">
            Goes into your organisation&rsquo;s review queue. Nothing here publishes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setResult(null);
            setError("");
          }}
          className="text-[13px] font-semibold opacity-60"
        >
          Close
        </button>
      </div>

      {mode === "chapter" ? (
        <>
          <ImportChapter onUploaded={onUploaded} />

          <button
            type="button"
            onClick={() => setMode("json")}
            className="mt-4 text-[12.5px] font-semibold underline opacity-50"
          >
            Already have it as JSON?
          </button>
        </>
      ) : (
      <>
      <button
        type="button"
        onClick={() => setMode("chapter")}
        className="mb-3 text-[12.5px] font-semibold underline opacity-50"
      >
        ← Upload a chapter PDF instead
      </button>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select
          value={entityType}
          onChange={(event) => setEntityType(event.target.value as "concept" | "question")}
          className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
        >
          <option value="concept">Concept</option>
          <option value="question">Question</option>
        </select>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-[14px] dark:border-white/15">
          <FileJson className="h-4 w-4" />
          Choose a .json file
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
        </label>

        <span className="text-[12.5px] text-[#667085]">or paste below</span>
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={PLACEHOLDER}
        spellCheck={false}
        rows={12}
        className="w-full rounded-xl border border-black/10 bg-transparent p-3 font-mono text-[12.5px] leading-relaxed dark:border-white/15"
      />

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-[13.5px]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 rounded-xl bg-black/5 px-4 py-3 text-[13.5px] dark:bg-white/10">
          <p className="flex items-center gap-2 font-semibold">
            <Check className="h-4 w-4" />
            {result.blocking > 0
              ? `Saved as a draft with ${result.blocking} thing${result.blocking === 1 ? "" : "s"} to fix.`
              : "Saved and sent for review."}
          </p>

          {/* Shown here rather than only on the review screen: the person who
              wrote it is the one who can fix it, and they are still looking. */}
          {(result.issues ?? []).length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.issues.map((issue, index) => (
                <li key={index} className="opacity-75">
                  <span className="font-mono text-[11px] uppercase tracking-wider">
                    {issue.severity}
                  </span>{" "}
                  {issue.where}: {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button type="button" onClick={() => void submit()} disabled={busy || !text.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Checking…" : "Add to queue"}
        </Button>

        <p className="text-[12.5px] text-[#667085]">
          Validated before it is stored — you will see what is wrong with it.
        </p>
      </div>
      </>
      )}
    </section>
  );
}
