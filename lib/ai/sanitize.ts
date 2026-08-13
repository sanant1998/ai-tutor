/* Cleaning a stream is not the same job as cleaning a string.

   Providers occasionally emit their own chat scaffolding — `</s>`,
   `<|im_end|>`, `[/INST]` — and open-weight models do it often. Running a
   regex over each chunk as it arrives looks like it works and does not: the
   provider splits on token boundaries, not on anything meaningful, so `</s>`
   frequently arrives as `</` then `s>`. Neither half matches the pattern,
   both get forwarded, and the student watches `</s>` appear in the middle of
   an explanation.

   The fix is to never emit the last few characters, and — this is the half
   that was missing — to strip markers from the BUFFER rather than from the
   text on its way out.

   Cleaning the outgoing slice looks equivalent and is not. The buffer holds
   back a tail, so a marker is always complete in the buffer before it is
   complete in anything emitted; but the slice handed to the regex is a sliding
   window a few characters wide, and a marker straddling two windows matches
   neither. With four-character deltas — ordinary for a streaming provider —
   `<|im_end|>` went out as `<|im`, `_end`, `|> `, and every one of those
   passed the filter. Only `</s>` survived the bug, by being short enough to
   land inside a single window.

   So: clean the buffer on every push, while any complete marker is still whole
   inside it, and only then slice. The tail then has one job, and the invariant
   it has to satisfy is simply that it is longer than the longest marker.

   The same buffer solves the second problem: the verdict. The tutor's reply
   ends with a machine-readable block the student must never see, and once
   `<verdict>` has been held back for long enough to be recognised, everything
   after it can be dropped. */

const STOP_TOKENS =
  /<\/?s>|<\|im_end\|>|<\|endoftext\|>|<\|eot_id\|>|\[\/INST\]|<\|start_header_id\|>|<\|end_header_id\|>/g;

export const VERDICT_OPEN = "<verdict>";

/* Every marker the tail has to be able to hold, longest first. Derived rather
   than counted by hand: the previous constant was set from a comment claiming
   the longest was `<|endoftext|>` at 13, when `<|start_header_id|>` is 19 —
   which is exactly how a 16-character tail came to be shorter than the thing
   it was supposed to contain. */
const MARKERS = [
  "<|start_header_id|>",
  "<|end_header_id|>",
  "<|endoftext|>",
  "<|im_end|>",
  "<|eot_id|>",
  "[/INST]",
  VERDICT_OPEN,
  "</s>",
  "<s>",
];

const LONGEST = Math.max(...MARKERS.map((marker) => marker.length));

/* Four characters of headroom over the longest marker, so adding a slightly
   longer one to the list above does not silently reopen the bug. */
const TAIL = LONGEST + 4;

export type Sanitizer = {
  /* Returns the text that is safe to send now — often "". */
  push(chunk: string): string;
  /* Call once the stream ends, for whatever is left in the buffer. */
  flush(): string;
};

export function makeSanitizer(): Sanitizer {
  let buffer = "";
  let stopped = false;

  return {
    push(chunk: string) {
      if (stopped) return "";

      /* Clean the whole buffer, not the slice about to leave it. Any complete
         marker is whole in here — the tail guarantees that — so this is the
         one place a match can reliably be made. */
      buffer = clean(buffer + chunk);

      const marker = buffer.indexOf(VERDICT_OPEN);
      if (marker !== -1) {
        /* Everything before the verdict is real prose and should still be
           shown; everything from it onwards never is. */
        stopped = true;
        const out = buffer.slice(0, marker);
        buffer = "";
        return out;
      }

      if (buffer.length <= TAIL) return "";

      /* Safe to emit: what is left behind is TAIL characters, which is longer
         than any marker, so nothing partial can escape in this slice. */
      const out = buffer.slice(0, buffer.length - TAIL);
      buffer = buffer.slice(buffer.length - TAIL);
      return out;
    },

    flush() {
      if (stopped) return "";

      const out = clean(buffer).split(VERDICT_OPEN)[0]!;
      buffer = "";
      stopped = true;

      /* The stream can end mid-marker — a provider cut off, a token limit hit
         inside `<|start_header_id|`. Nothing will complete it now, so a
         trailing fragment would be shown verbatim. Drop it. */
      return stripDanglingMarker(out);
    },
  };
}

function clean(text: string) {
  return text.replace(STOP_TOKENS, "");
}

/* Removes an incomplete marker left at the very end of a finished stream.
 *
 * Deliberately conservative. Only fragments beginning with an opener that
 * cannot be ordinary prose count — `<|` and `[/`. A bare `<`, or `<s`, is left
 * alone: this is a maths tutor, "5 < 8" and "3 < x" arrive constantly, and
 * eating the operator to save a three-character `<s>` fragment is a trade in
 * the wrong direction. Anything complete has already gone in clean(); what is
 * left here is a rare, harmless tail. */
const DANGLING_OPENERS = ["<|", "[/"];

function stripDanglingMarker(text: string): string {
  const candidates = MARKERS.filter((marker) =>
    DANGLING_OPENERS.some((opener) => marker.startsWith(opener)),
  );

  /* Longest prefix first, so `<|start_header_id|` is matched as itself rather
     than as the shorter `<|s`. */
  for (let length = LONGEST - 1; length >= 2; length -= 1) {
    const trailing = text.slice(-length);
    if (trailing.length < length) continue;

    if (candidates.some((marker) => marker.startsWith(trailing))) {
      return text.slice(0, text.length - length);
    }
  }

  return text;
}

/* For the non-streaming paths and the eval harness, where the whole reply is
   in hand and the streaming problem does not arise. */
export function stripVerdict(text: string) {
  return clean(text.split(VERDICT_OPEN)[0]).trim();
}
