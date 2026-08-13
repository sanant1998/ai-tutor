/* Sanitiser for model-written SVG.

   The explainer renders this markup inside the page, which makes it an XSS
   surface: SVG can carry <script>, event handlers, <foreignObject> with
   arbitrary HTML, and javascript: URLs. A model has no intent to attack, but
   it is repeating patterns from its training data and the prompt is partly
   shaped by student-chosen topics — "the model wrote it" is not a security
   boundary.

   So this is an allowlist, not a blocklist: anything not named here is
   dropped. Shapes, text and grouping survive; script, links, embedded
   documents and every on* handler do not. */

const ALLOWED_TAGS = new Set([
  "svg",
  "g",
  "defs",
  "title",
  "desc",
  "path",
  "line",
  "polyline",
  "polygon",
  "rect",
  "circle",
  "ellipse",
  "text",
  "tspan",
  "marker",
  "linearGradient",
  "radialGradient",
  "stop",
]);

const ALLOWED_ATTRS = new Set([
  "viewBox",
  "xmlns",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "transform",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-opacity",
  "opacity",
  "font-size",
  "font-family",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "dx",
  "dy",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "marker-end",
  "marker-start",
  "id",
  "class",
  "orient",
  "refX",
  "refY",
  "markerWidth",
  "markerHeight",
]);

/* Returns sanitised SVG, or "" when the input is not usable as one. */
export function sanitiseSvg(raw: string): string {
  if (typeof raw !== "string") return "";

  let svg = raw.trim();

  /* Models like to wrap output in a code fence even when told not to. */
  svg = svg.replace(/^```(?:svg|xml|html)?\s*/i, "").replace(/```$/i, "").trim();

  if (!svg.startsWith("<svg")) return "";
  /* A whole page of SVG is a sign something went wrong; cap it. */
  if (svg.length > 60_000) return "";

  /* Drop comments, doctypes and processing instructions outright — they can
     hide markup from a naive tag scan. */
  svg = svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<\?[\s\S]*?\?>/g, "");

  /* A linear scan rather than a regex, because a regex cannot express "drop
     this element and everything inside it" for nested markup: the outer <svg>
     match swallows the whole document, and inner disallowed elements are never
     examined — their tags get stripped later but their text content survives.
     Scanning with a skip depth removes the element and its body together. */
  const out: string[] = [];
  let skipDepth = 0;
  let skipTag = "";
  let index = 0;

  while (index < svg.length) {
    const open = svg.indexOf("<", index);

    if (open === -1) {
      if (skipDepth === 0) out.push(svg.slice(index));
      break;
    }

    if (skipDepth === 0) out.push(svg.slice(index, open));

    const close = svg.indexOf(">", open);
    if (close === -1) break;

    const rawTag = svg.slice(open, close + 1);
    const match = rawTag.match(/^<\s*(\/?)\s*([a-zA-Z][\w:-]*)([\s\S]*?)(\/?)\s*>$/);

    index = close + 1;
    if (!match) continue;

    const [, closing, tag, attrs, selfClose] = match;

    /* Inside a dropped element: track nesting so an inner <g> does not end the
       skip early, and emit nothing until its own close tag. */
    if (skipDepth > 0) {
      if (tag === skipTag && !closing && !selfClose) skipDepth += 1;
      else if (tag === skipTag && closing) skipDepth -= 1;
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      if (!closing && !selfClose) {
        skipDepth = 1;
        skipTag = tag;
      }
      continue;
    }

    if (closing) {
      out.push(`</${tag}>`);
      continue;
    }

    const kept: string[] = [];
    const pattern = /([a-zA-Z_:][-\w:.]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g;

    let attr: RegExpExecArray | null;
    while ((attr = pattern.exec(attrs))) {
      const name = attr[1];
      const value = attr[2].replace(/^["']|["']$/g, "");

      if (!ALLOWED_ATTRS.has(name)) continue;
      /* Belt and braces: no value may carry a script-bearing scheme. */
      if (/(?:javascript|vbscript|data)\s*:/i.test(value)) continue;

      kept.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
    }

    out.push(
      `<${tag}${kept.length ? " " + kept.join(" ") : ""}${selfClose ? "/" : ""}>`,
    );
  }

  svg = out.join("");

  return svg.includes("<svg") ? svg : "";
}
