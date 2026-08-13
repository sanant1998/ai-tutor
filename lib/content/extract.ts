/* Getting the words out of a teacher's file.
 *
 * ---------------------------------------------------------------------------
 * WHY A TEXT LAYER AND NOT VISION
 *
 * NCERT publishes its textbooks as PDFs with a real text layer, and so does
 * every board and most schools' own material. Pulling that text out is exact,
 * instant and free. Sending page images to a vision model is none of those,
 * and it introduces a second place for the mathematics to be misread before
 * anybody has even looked at the draft.
 *
 * So the text layer is tried first, always. When there is not one — a scan, or
 * a photograph of a page — the pages are rendered and read by a vision model
 * instead. That is slower and costs more per page, which is exactly why it is
 * the fallback and not the default, but a teacher photographing a textbook is
 * a real and common thing and "your file will not work" is not an answer.
 *
 * The two paths are reported separately rather than collapsed into one error,
 * so the route can act on the difference instead of matching on a message.
 *
 * ---------------------------------------------------------------------------
 * WHAT SURVIVES AND WHAT DOES NOT
 *
 * Layout does not. A PDF stores glyphs at coordinates, not paragraphs, so what
 * comes back is the reading order the extractor guessed. Prose survives that
 * well. Mathematics survives it badly: a fraction laid out over two lines
 * arrives as two numbers, superscripts flatten, and symbols outside the
 * standard encodings drop out entirely.
 *
 * That is why the authoring prompt is told the text came from a PDF and to
 * leave out anything it cannot read with confidence, and why every concept
 * this produces lands in the review queue. A human reading the draft next to
 * the real page is the check, and there is no version of this feature that
 * does not need one. */

/* Re-exported so every existing import of these from this module keeps
   working. They live in ./limits because a client component that wants one of
   them must not pull the canvas binary in behind it. */
export { MAX_CHARS, MAX_BYTES, MAX_SCAN_PAGES } from "@/lib/content/limits";
import { MAX_CHARS, MAX_BYTES, MAX_SCAN_PAGES } from "@/lib/content/limits";

export type Extracted = {
  text: string;
  pages: number;
  /* Characters of text per page. Below a few hundred the "PDF" is a picture of
     a page, whatever its extension says. */
  density: number;
};

export type ExtractResult =
  | { ok: true; value: Extracted }
  /* `scanned` separates "this PDF has no text layer" from "this file is not a
     PDF". The first has a way forward — render the pages and read them with a
     vision model — and the second does not. */
  | { ok: false; reason: string; scanned?: boolean; pages?: number };

/* Not shown to anyone: the route turns a scanned PDF into images rather than
   reporting it. Here so the two call sites cannot drift on what it means. */
const SCANNED = "This PDF has no text layer.";

/* Generous, because a chapter is genuinely long, and bounded, because the
   whole thing goes into a prompt. Around 60k characters is a full NCERT
   chapter with room to spare. */

/* A page of real text runs to a couple of thousand characters. Two hundred is
   the page number and a caption — the signature of a scan. */
const MIN_CHARS_PER_PAGE = 200;

export async function extractPdf(file: ArrayBuffer): Promise<ExtractResult> {
  if (file.byteLength > MAX_BYTES) {
    return {
      ok: false,
      reason: `That file is ${(file.byteLength / 1024 / 1024).toFixed(1)} MB. Upload one chapter at a time — under ${MAX_BYTES / 1024 / 1024} MB.`,
    };
  }

  let pages: number;
  let text: string;

  try {
    /* Imported here rather than at module scope: it pulls in a PDF engine, and
       nothing else in the app should pay for that on a cold start. */
    const { extractText, getDocumentProxy } = await import("unpdf");

    const document = await getDocumentProxy(new Uint8Array(file));
    const result = await extractText(document, { mergePages: true });

    pages = document.numPages;
    text = Array.isArray(result.text) ? result.text.join("\n\n") : result.text;
  } catch (error) {
    return {
      ok: false,
      reason: `That file could not be read as a PDF${
        error instanceof Error ? ` — ${error.message}` : ""
      }.`,
    };
  }

  const clean = tidy(text);
  const density = pages > 0 ? clean.length / pages : 0;

  /* No usable text layer: this is a scan, or a photograph of a page saved as a
     PDF. Not a failure — it is the other half of the feature, and the caller
     renders the pages and sends them to a vision model instead. Reported as a
     distinct outcome rather than an error so the route does not have to
     pattern-match on a message to tell the two apart. */
  if (clean.length === 0 || density < MIN_CHARS_PER_PAGE) {
    return { ok: false, reason: SCANNED, scanned: true, pages };
  }

  return {
    ok: true,
    value: { text: clean.slice(0, MAX_CHARS), pages, density: Math.round(density) },
  };
}

/* PDF extraction leaves debris that costs prompt tokens and tells the model
   nothing: hyphens splitting words across a line break, runs of spaces where
   a column boundary was, and page furniture repeated on every page. */
function tidy(raw: string): string {
  return raw
    /* "multi-\nplication" is one word. */
    .replace(/(\w)-\s*\n\s*(\w)/g, "$1$2")
    .replace(/\r/g, "")
    /* Column gaps arrive as long runs of spaces. */
    .replace(/[ \t]{2,}/g, " ")
    /* Three or more blank lines is always layout, never meaning. */
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    /* A line that is nothing but a page number. */
    .filter((line) => !/^\d{1,4}$/.test(line))
    .join("\n")
    .trim();
}

/* --------------------------------------------------------------------------
   Rendering a scan

   pdfjs draws to a canvas, and there is no canvas in a Node server. unpdf does
   not bundle one — it asks for it — so @napi-rs/canvas is a dependency of this
   path and only this path.

   It ships prebuilt binaries per platform rather than compiling on install,
   which is why it is acceptable here; a source-built canvas would put a C
   toolchain on the critical path of every deploy. It is imported lazily below
   so a deployment that never receives a scanned PDF never loads it.
   -------------------------------------------------------------------------- */

/* Vision costs per page and a chapter is long. Eight pages is enough to cover
   the material a teacher photographs in one go, and a hard stop is better than
   a bill nobody predicted. */

export type RenderedPage = { mediaType: string; base64: string };

export async function renderPages(
  file: ArrayBuffer,
  limit = MAX_SCAN_PAGES,
): Promise<{ ok: true; pages: RenderedPage[] } | { ok: false; reason: string }> {
  try {
    const [{ getDocumentProxy, renderPageAsImage }, canvasImport] = await Promise.all([
      import("unpdf"),
      /* Handed to pdfjs as its canvas backend. Lazy, and only on this path. */
      import("@napi-rs/canvas"),
    ]);

    /* A fresh copy for every call into pdfjs.
     *
     * pdfjs takes ownership of the buffer it is handed and transfers it to its
     * worker, which DETACHES the original: the second read of the same
     * ArrayBuffer throws "Cannot perform Construct on a detached ArrayBuffer".
     * Reading the page count and then rendering each page is three or four
     * reads, so this is not an edge case — it is every scan. */
    const copy = () => new Uint8Array(file.slice(0));

    const document = await getDocumentProxy(copy());
    const count = Math.min(document.numPages, limit);

    const pages: RenderedPage[] = [];

    for (let page = 1; page <= count; page += 1) {
      /* Scale 2 renders at roughly 150 dpi. Below that the small print in a
         worked example stops being legible to the model, which produces
         confident misreadings rather than an obvious failure. */
      const image = await renderPageAsImage(copy(), page, {
        scale: 2,
        canvasImport: () => Promise.resolve(canvasImport),
      });

      pages.push({
        mediaType: "image/png",
        base64: Buffer.from(image).toString("base64"),
      });
    }

    if (pages.length === 0) {
      return { ok: false, reason: "That PDF has no pages to read." };
    }

    return { ok: true, pages };
  } catch (error) {
    return {
      ok: false,
      reason: `Those pages could not be read as images${
        error instanceof Error ? ` — ${error.message}` : ""
      }.`,
    };
  }
}
