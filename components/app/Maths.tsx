"use client";

/* Rendering the maths in a tutor message.
 *
 * KaTeX rather than MathJax: about a tenth of the weight and synchronous, both
 * of which matter here. The audience is on a mid-range Android over 4G, and
 * MathJax's asynchronous typesetting means every streamed chunk reflows the
 * message — the text visibly jumps as the tutor types. KaTeX renders in the
 * same frame as the string it came from.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS LOADED LAZILY ANYWAY
 *
 * KaTeX is still about 80 KB, which is over half the initial-JS budget for
 * this app on its own. So it is imported after mount, and until it arrives the
 * expressions render as their plain source — "5/8" instead of a typeset
 * fraction. That is readable, so the first paint is complete rather than
 * blank, and the typeset version replaces it a moment later.
 *
 * The parser is deliberately dumb: split on $...$ and render the inside. A
 * markdown pipeline would be more general and would also be a second place for
 * model output to become HTML. Nothing here ever produces markup from model
 * text except through KaTeX, which escapes what it cannot parse. */

import { useEffect, useMemo, useState } from "react";

/* The stylesheet stays a static import: webpack extracts it into the route's
   CSS chunk rather than the JavaScript bundle, so it costs nothing against the
   JS budget and arrives with the page instead of a frame later. Only the
   renderer — the 80 KB of JavaScript — is worth deferring. */
import "katex/dist/katex.min.css";

import { text } from "@/lib/theme";

type Katex = {
  renderToString: (expression: string, options: Record<string, unknown>) => string;
};

/* Module-level, so the second message does not re-import and every component
   shares one instance. */
let katexModule: Katex | null = null;
let katexPromise: Promise<Katex | null> | null = null;

function loadKatex(): Promise<Katex | null> {
  if (katexPromise) return katexPromise;

  katexPromise = import("katex")
    .then((module) => {
      katexModule = (module.default ?? module) as unknown as Katex;
      return katexModule;
    })
    .catch(() => null);

  return katexPromise;
}

export function Maths({ children, className }: { children: string; className?: string }) {
  const [ready, setReady] = useState(katexModule !== null);
  const parts = useMemo(() => split(children), [children]);

  useEffect(() => {
    if (katexModule) return;
    let live = true;
    void loadKatex().then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.maths && ready && katexModule ? (
          <span
            key={index}
            /* Generated from the expression by KaTeX itself with throwOnError
               off — an expression it cannot parse comes back as escaped text
               in an error colour, never as raw HTML. */
            dangerouslySetInnerHTML={{ __html: render(part.value) }}
          />
        ) : (
          /* Before KaTeX lands, and for plain prose. */
          <span key={index}>{part.value}</span>
        ),
      )}
    </span>
  );
}

function split(input: string): { maths: boolean; value: string }[] {
  const parts: { maths: boolean; value: string }[] = [];
  let rest = input;

  while (rest.length > 0) {
    const open = rest.indexOf("$");

    if (open === -1) {
      parts.push({ maths: false, value: rest });
      break;
    }

    const close = rest.indexOf("$", open + 1);

    /* An unclosed $ happens constantly mid-stream, because the closing one has
       not arrived yet. Treat it as text; the next chunk re-renders the whole
       message with the pair complete. */
    if (close === -1) {
      parts.push({ maths: false, value: rest });
      break;
    }

    if (open > 0) parts.push({ maths: false, value: rest.slice(0, open) });
    parts.push({ maths: true, value: rest.slice(open + 1, close) });
    rest = rest.slice(close + 1);
  }

  return parts;
}

function render(expression: string) {
  try {
    return (
      katexModule?.renderToString(expression, {
        throwOnError: false,
        displayMode: false,
        output: "html",
        strict: false,
      }) ?? escapeHtml(expression)
    );
  } catch {
    return escapeHtml(expression);
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* The tutor writes short paragraphs and the occasional numbered step. Bold via
   **…** is the only markdown honoured, because it is the only one the prompt
   asks for. */
export function TutorMessage({ body }: { body: string }) {
  const blocks = body.split(/\n{2,}/).filter((block) => block.trim().length > 0);

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => (
        <p key={index} className="text-[15px] leading-relaxed" style={{ color: text(0.86) }}>
          {block.split(/(\*\*[^*]+\*\*)/g).map((piece, pieceIndex) =>
            piece.startsWith("**") && piece.endsWith("**") ? (
              <strong key={pieceIndex} style={{ color: text() }}>
                <Maths>{piece.slice(2, -2)}</Maths>
              </strong>
            ) : (
              <Maths key={pieceIndex}>{piece}</Maths>
            ),
          )}
        </p>
      ))}
    </div>
  );
}
