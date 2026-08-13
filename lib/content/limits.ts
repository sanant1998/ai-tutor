/* The numbers the upload screen and the extractor both have to agree on.
 *
 * ---------------------------------------------------------------------------
 * WHY THEY ARE NOT IN extract.ts
 *
 * They were, and one constant imported from a client component pulled the
 * whole module into the browser bundle with it — including @napi-rs/canvas,
 * whose platform binary webpack cannot parse. The production build failed on
 * `skia.win32-x64-msvc.node is not supported in the browser`, an error naming
 * a file nobody wrote, from a component that only wanted to print "the first 8
 * pages" in a caption.
 *
 * A module with no imports cannot drag anything anywhere. That is the whole
 * design of this file: constants only, so either side may read them.
 *
 * They belong in one place rather than being typed twice, because the caption
 * telling a teacher how many pages will be read and the loop that stops after
 * that many pages disagreeing is a promise broken in the one direction nobody
 * checks. */

/* Pages rendered for the vision fallback, when a PDF has no text layer.
 * Eight is a chapter's worth at NCERT's density, and each page is a model call
 * with an image attached — the cost line is why this has a limit at all. */
export const MAX_SCAN_PAGES = 8;

/* Characters kept from a text layer. Beyond this the draft is unreviewable by
   a human anyway, which is the step everything here exists to feed. */
export const MAX_CHARS = 60_000;

/* Upload ceiling. A scanned chapter runs 3-8 MB; 20 leaves room for a
   badly-compressed phone photograph set without accepting a whole textbook. */
export const MAX_BYTES = 20 * 1024 * 1024;
