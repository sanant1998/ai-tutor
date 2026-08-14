/* Which syllabi the product actually covers.
 *
 * A server component on purpose. The cards are derived from lib/syllabus.ts,
 * and that module carries every sourced chapter list in the product — reading
 * it in the browser to render eight card titles would ship the NCERT Class 10
 * Science contents to every visitor who never scrolls this far. Both countries
 * are summarised here at build time and handed over as two small arrays; only
 * the choice between them is client work. */

import { BOARDS } from "@/lib/content";
import { boardCoverage, boardsFor, classLabel, type CountryId } from "@/lib/syllabus";

import { BoardsForCountry, type BoardCard } from "@/components/sections/BoardsForCountry";

function cardsFor(country: CountryId): BoardCard[] {
  return boardsFor(country).map((board) => {
    const { levels, subjects } = boardCoverage(board.id);

    return {
      name: board.name,
      detail: board.detail,
      basis: board.basis,
      /* A contiguous range reads better than a list, and every board that has
         anything has a contiguous one. Written from the real coverage rather
         than asserted, so it cannot outlive the chapter lists behind it. */
      ready:
        levels.length === 0
          ? null
          : `${
              levels.length === 1
                ? classLabel(country, levels[0])
                : `${classLabel(country, levels[0])}–${levels[levels.length - 1]}`
            } · ${subjects.join(" · ")}`,
    };
  });
}

/* Exported so the noscript mirror lists exactly what the visible section
   lists. A crawler has no toggle to tap, so it gets both. */
export function boardGroups() {
  return {
    in: { ...BOARDS.byCountry.in, cards: cardsFor("in") },
    us: { ...BOARDS.byCountry.us, cards: cardsFor("us") },
  };
}

export function Boards() {
  return (
    <BoardsForCountry
      eyebrow={BOARDS.eyebrow}
      heading={BOARDS.heading}
      byCountry={boardGroups()}
    />
  );
}
