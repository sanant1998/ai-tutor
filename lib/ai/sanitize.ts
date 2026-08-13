/* Cleaning a stream is not the same job as cleaning a string.

   Providers occasionally emit their own chat scaffolding — `</s>`,
   `<|im_end|>`, `[/INST]` — and open-weight models do it often. Running a
   regex over each chunk as it arrives looks like it works and does not: the
   provider splits on token boundaries, not on anything meaningful, so `</s>`
   frequently arrives as `</` then `s>`. Neither half matches the pattern,
   both get forwarded, and the student watches `</s>` appear in the middle of
   an explanation.

   The fix is to never emit the last few characters. Hold back a tail longer
   than the longest marker, and any marker is either complete in the part being
   emitted — where the regex catches it — or still in the buffer, where it will
   be complete before it is ever emitted.

   The same buffer solves the second problem: the verdict. The tutor's reply
   ends with a machine-readable block the student must never see, and once
   `<verdict>` has been held back for long enough to be recognised, everything
   after it can be dropped. */

/* Longest marker below is `<|endoftext|>` at 13 characters; `<verdict>` is 9.
   16 leaves room without holding back so much that the text visibly lags. */
const TAIL = 16;

const STOP_TOKENS = /<\/?s>|<\|im_end\|>|<\|endoftext\|>|<\|eot_id\|>|\[\/INST\]|<\|start_header_id\|>|<\|end_header_id\|>/g;

export const VERDICT_OPEN = "<verdict>";

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

      buffer += chunk;

      const marker = buffer.indexOf(VERDICT_OPEN);
      if (marker !== -1) {
        /* Everything before the verdict is real prose and should still be
           shown; everything from it onwards never is. */
        stopped = true;
        const out = buffer.slice(0, marker);
        buffer = "";
        return clean(out);
      }

      if (buffer.length <= TAIL) return "";

      const out = buffer.slice(0, buffer.length - TAIL);
      buffer = buffer.slice(buffer.length - TAIL);
      return clean(out);
    },

    flush() {
      if (stopped) return "";
      const out = buffer.split(VERDICT_OPEN)[0];
      buffer = "";
      stopped = true;
      return clean(out);
    },
  };
}

function clean(text: string) {
  return text.replace(STOP_TOKENS, "");
}

/* For the non-streaming paths and the eval harness, where the whole reply is
   in hand and the streaming problem does not arise. */
export function stripVerdict(text: string) {
  return clean(text.split(VERDICT_OPEN)[0]).trim();
}
