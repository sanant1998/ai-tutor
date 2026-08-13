/* Study Tycoon — the idle game offered while the roadmap builds.

   All balance lives here so the component stays about rendering. Numbers are
   tuned for a session of roughly a minute: tapping alone gets you the first
   generator quickly, and each tier after that is a visible step up. */

export type Generator = {
  id: string;
  name: string;
  blurb: string;
  glyph: string;
  /* Marks per second each one produces. */
  rate: number;
  /* Cost of the first one; each subsequent costs GROWTH× more. */
  baseCost: number;
};

export const GROWTH = 1.15;

export const GENERATORS: Generator[] = [
  {
    id: "flashcards",
    name: "Flashcards",
    blurb: "A deck that shuffles itself",
    glyph: "🃏",
    rate: 0.5,
    baseCost: 15,
  },
  {
    id: "pastpaper",
    name: "Past papers",
    blurb: "Marked while you sleep",
    glyph: "📄",
    rate: 2,
    baseCost: 120,
  },
  {
    id: "studygroup",
    name: "Study group",
    blurb: "Four of you, one whiteboard",
    glyph: "👥",
    rate: 8,
    baseCost: 900,
  },
  {
    id: "tutor",
    name: "AI tutor",
    blurb: "Never sleeps, never sighs",
    glyph: "🤖",
    rate: 34,
    baseCost: 7_500,
  },
  {
    id: "examhall",
    name: "Exam hall",
    blurb: "Silence, and a hundred desks",
    glyph: "🏛️",
    rate: 140,
    baseCost: 62_000,
  },
];

export type Owned = Record<string, number>;

/* Cost of the next single unit of a generator. */
export function unitCost(generator: Generator, owned: number) {
  return generator.baseCost * Math.pow(GROWTH, owned);
}

/* Cost of buying `count` more, as a geometric series. */
export function bulkCost(generator: Generator, owned: number, count: number) {
  if (count <= 0) return 0;
  return (
    generator.baseCost *
    Math.pow(GROWTH, owned) *
    ((Math.pow(GROWTH, count) - 1) / (GROWTH - 1))
  );
}

/* How many more you could afford with `marks` in hand. */
export function affordableCount(
  generator: Generator,
  owned: number,
  marks: number,
) {
  const first = unitCost(generator, owned);
  if (marks < first) return 0;

  const ratio = (marks * (GROWTH - 1)) / first + 1;
  return Math.floor(Math.log(ratio) / Math.log(GROWTH));
}

export function ratePerSecond(owned: Owned) {
  return GENERATORS.reduce(
    (total, generator) => total + generator.rate * (owned[generator.id] ?? 0),
    0,
  );
}

/* Combo: taps landing within COMBO_WINDOW of each other build a multiplier,
   which decays as soon as you slow down. */
export const COMBO_WINDOW_MS = 420;
export const COMBO_MAX = 5;

export function nextCombo(current: number, sinceLastTap: number) {
  if (sinceLastTap > COMBO_WINDOW_MS) return 1;
  return Math.min(COMBO_MAX, current + 0.25);
}

export type Achievement = {
  id: string;
  label: string;
  /* Met against the running totals. */
  test: (stats: {
    lifetime: number;
    taps: number;
    perSecond: number;
    owned: Owned;
    bestCombo: number;
  }) => boolean;
};

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first", label: "First mark", test: (s) => s.lifetime >= 1 },
  { id: "taps50", label: "50 taps", test: (s) => s.taps >= 50 },
  { id: "taps250", label: "250 taps", test: (s) => s.taps >= 250 },
  { id: "taps1000", label: "1,000 taps", test: (s) => s.taps >= 1000 },
  { id: "combo2", label: "Combo ×2", test: (s) => s.bestCombo >= 2 },
  { id: "combo5", label: "Combo ×5", test: (s) => s.bestCombo >= COMBO_MAX },
  { id: "marks100", label: "100 marks", test: (s) => s.lifetime >= 100 },
  { id: "marks10k", label: "10,000 marks", test: (s) => s.lifetime >= 10_000 },
  { id: "marks1m", label: "1,000,000 marks", test: (s) => s.lifetime >= 1_000_000 },
  { id: "gen1", label: "First hire", test: (s) => ratePerSecond(s.owned) > 0 },
  { id: "rate10", label: "10 marks a second", test: (s) => s.perSecond >= 10 },
  { id: "rate500", label: "500 marks a second", test: (s) => s.perSecond >= 500 },
  {
    id: "everything",
    label: "One of everything",
    test: (s) => GENERATORS.every((g) => (s.owned[g.id] ?? 0) > 0),
  },
  {
    id: "hall",
    label: "Ten exam halls",
    test: (s) => (s.owned.examhall ?? 0) >= 10,
  },
];

/* Compact numbers: 1.2K, 3.4M, 5.6B. */
export function formatMarks(value: number) {
  if (value < 1000) return Math.floor(value).toLocaleString();

  const units = ["K", "M", "B", "T", "Qa"];
  let scaled = value;
  let unit = -1;

  while (scaled >= 1000 && unit < units.length - 1) {
    scaled /= 1000;
    unit += 1;
  }

  return `${scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0)}${units[unit]}`;
}
