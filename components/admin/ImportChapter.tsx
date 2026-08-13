"use client";

/* Upload the chapter. The queue fills with drafts.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS REPLACED THE JSON BOX AS THE MAIN WAY IN
 *
 * The first version of teacher upload was a textarea that took a concept as
 * JSON. It matched the format the system already speaks, which is exactly the
 * wrong thing to optimise for: a teacher has a PDF of a chapter and knows what
 * a chapter is. They do not know what JSON is, and no amount of a good
 * placeholder fixes that.
 *
 * So the file picker is the feature and the JSON box is the advanced option
 * behind a link, for the platform team and for anything author-concept.ts
 * produces.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROMISES, AND WHAT IT CAREFULLY DOES NOT
 *
 * The model is not being trained, and the copy says so. A teacher who believes
 * their upload is teaching the AI will expect it to know the chapter forever,
 * will not understand why deleting the drafts removes it, and will not review
 * the drafts because reviewing is not something you do to a trained model.
 * Every one of those is a worse outcome than a slightly longer sentence.
 *
 * The waiting message is honest about the time as well. Reading a chapter and
 * writing four packs takes a minute or two, and a spinner with no expectation
 * attached is how somebody reloads the page halfway through. */

import { useRef, useState } from "react";
import { AlertTriangle, Check, FileText, Loader2, Upload } from "lucide-react";

import { MAX_SCAN_PAGES } from "@/lib/content/limits";
import { Button } from "@/components/ui/button";

type Imported = {
  chapterTitle: string;
  pages: number;
  /* True when the PDF had no text layer and the pages were read as images. */
  scanned: boolean;
  /* True when the scan was longer than the page cap and was cut short. */
  truncated: boolean;
  /* Set when a concept came back with fewer misconceptions or examples than
     the format requires, even after the retry. */
  incomplete: string | null;
  concepts: { id: string; title: string; issues: number }[];
  note: string;
};

const BOARDS = [
  { id: "cbse", name: "CBSE" },
  { id: "icse", name: "ICSE" },
  { id: "upboard", name: "UP Board" },
];

const SUBJECTS = [
  { id: "maths", name: "Mathematics" },
  { id: "science", name: "Science" },
  { id: "sst", name: "Social Science" },
  { id: "english", name: "English" },
  { id: "hindi", name: "Hindi" },
];

export function ImportChapter({ onUploaded }: { onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [board, setBoard] = useState("cbse");
  const [classLevel, setClassLevel] = useState(8);
  const [subjectId, setSubjectId] = useState("maths");
  const [chapterNo, setChapterNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Imported | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!file) return;

    setBusy(true);
    setError("");
    setResult(null);

    const form = new FormData();
    form.append("file", file);
    form.append("board", board);
    form.append("classLevel", String(classLevel));
    form.append("subjectId", subjectId);
    if (chapterNo) form.append("chapterNo", chapterNo);

    try {
      const response = await fetch("/api/admin/content/import", {
        method: "POST",
        body: form,
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "The import failed.");
        return;
      }

      setResult(body as Imported);
      setFile(null);
      if (input.current) input.current.value = "";
      onUploaded();
    } catch {
      setError("Could not reach the server. The file may be too large.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-black/20 px-4 py-3 text-[14px] dark:border-white/25">
          <FileText className="h-4 w-4" />
          {file ? file.name : "Choose the chapter PDF"}
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              setError("");
              setResult(null);
              setFile(event.target.files?.[0] ?? null);
            }}
          />
        </label>

        {file && (
          <span className="text-[12.5px] opacity-50">
            {(file.size / 1024 / 1024).toFixed(1)} MB
          </span>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={board}
          onChange={(event) => setBoard(event.target.value)}
          className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
        >
          {BOARDS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>

        <select
          value={classLevel}
          onChange={(event) => setClassLevel(Number(event.target.value))}
          className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
        >
          {[6, 7, 8, 9, 10].map((level) => (
            <option key={level} value={level}>
              Class {level}
            </option>
          ))}
        </select>

        <select
          value={subjectId}
          onChange={(event) => setSubjectId(event.target.value)}
          className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
        >
          {SUBJECTS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>

        <input
          value={chapterNo}
          onChange={(event) => setChapterNo(event.target.value.replace(/\D/g, ""))}
          placeholder="Chapter no."
          inputMode="numeric"
          className="w-28 rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
        />
      </div>

      {error && (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-[13.5px]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {result && (
        <div className="mb-3 rounded-xl bg-black/5 px-4 py-3 text-[13.5px] dark:bg-white/10">
          <p className="flex items-center gap-2 font-semibold">
            <Check className="h-4 w-4" />
            {result.chapterTitle} — {result.concepts.length} concept
            {result.concepts.length === 1 ? "" : "s"} from {result.pages} page
            {result.pages === 1 ? "" : "s"}
            {result.scanned ? " (read as images)" : ""}
          </p>

          {/* Both worth saying before the reviewer starts, not after. */}
          {result.truncated && (
            <p className="mt-2 opacity-75">
              Only the first {MAX_SCAN_PAGES} pages were read. Split the chapter and
              upload the rest separately.
            </p>
          )}

          {result.incomplete && (
            <p className="mt-2 opacity-75">Still incomplete: {result.incomplete}</p>
          )}

          <ul className="mt-2 space-y-1">
            {result.concepts.map((concept) => (
              <li key={concept.id} className="opacity-75">
                {concept.title}
                {concept.issues > 0 && (
                  <span className="ml-2 opacity-70">
                    · {concept.issues} to fix
                  </span>
                )}
              </li>
            ))}
          </ul>

          <p className="mt-2 opacity-70">{result.note}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void submit()} disabled={busy || !file}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Reading the chapter…" : "Read this chapter"}
        </Button>

        <p className="text-[12.5px] opacity-45">
          {busy
            ? "A minute or two. It is reading the whole chapter and writing a pack for each idea in it."
            : `A PDF of the chapter. A scan or photographed pages work too — those are read as images, which is slower and only covers the first ${MAX_SCAN_PAGES} pages.`}
        </p>
      </div>

      {/* The sentence that stops a teacher expecting the wrong thing. */}
      <p className="mt-4 border-t border-black/5 pt-3 text-[12.5px] leading-relaxed opacity-50 dark:border-white/10">
        This does not train the AI. Your chapter is read once and turned into
        teaching material you can edit, and only what you publish is used —
        after which the tutor teaches from it and answers your students&rsquo;
        questions out of it. Delete it and the tutor no longer knows it.
      </p>
    </div>
  );
}
