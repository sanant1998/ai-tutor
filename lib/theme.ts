/* The nine themes the product ships. `chips` are the four swatches shown in
   the onboarding picker: background, surface, accent, secondary accent. */
export const THEMES = [
  {
    id: "notebook",
    label: "Notebook",
    swatch: "#fbf7f1",
    dot: "#1d5cff",
    chips: ["#fbf7f1", "#ffffff", "#1d5cff", "#e2554d"],
  },
  {
    id: "inkwell",
    label: "Inkwell",
    swatch: "#0d131c",
    dot: "#f5be3d",
    chips: ["#0d131c", "#1a222d", "#f5be3d", "#e8739a"],
  },
  {
    id: "dark",
    label: "Midnight",
    swatch: "#0a0c13",
    dot: "#5b8def",
    chips: ["#0a0c13", "#161a24", "#5b8def", "#a78bfa"],
  },
  {
    id: "ocean",
    label: "Ocean",
    swatch: "#07131d",
    dot: "#38bdf8",
    chips: ["#07131d", "#122636", "#38bdf8", "#5eead4"],
  },
  {
    id: "forest",
    label: "Forest",
    swatch: "#091410",
    dot: "#40c46f",
    chips: ["#091410", "#14261c", "#40c46f", "#a3e635"],
  },
  {
    id: "rose",
    label: "Rose Noir",
    swatch: "#150a0f",
    dot: "#f43f5e",
    chips: ["#150a0f", "#2a151d", "#f43f5e", "#fda4af"],
  },
  {
    id: "ember",
    label: "Ember",
    swatch: "#150d07",
    dot: "#f97316",
    chips: ["#150d07", "#2a1a0e", "#f97316", "#fbbf24"],
  },
  {
    id: "light",
    label: "Daylight",
    swatch: "#f6f7fb",
    dot: "#2f66d8",
    chips: ["#f6f7fb", "#ffffff", "#2f66d8", "#7c5cf0"],
  },
  {
    id: "paper",
    label: "Warm Paper",
    swatch: "#f7f3ee",
    dot: "#b65720",
    chips: ["#f7f3ee", "#ffffff", "#b65720", "#a3562f"],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_IDS = THEMES.map((t) => t.id) as readonly ThemeId[];

/* Notebook is the designed default — the warm paper look a first-time
   visitor sees. The dark themes remain a choice, not the starting point. */
export const DEFAULT_THEME: ThemeId = "notebook";
export const THEME_STORAGE_KEY = "mmr-theme";

/* Palette accessors.

   Every colour resolves through a CSS variable, so switching theme is a
   single class change on <html>. Passing an alpha returns a translucent
   variant built from the token's raw RGB channels. */
const token = (name: string, alpha?: number) =>
  alpha === undefined ? `var(--${name})` : `rgb(var(--${name}-rgb) / ${alpha})`;

export const bg = (a?: number) => token("bg", a);
export const text = (a?: number) => token("text", a);
export const acc = (a?: number) => token("acc", a);
export const acc2 = (a?: number) => token("acc-2", a);
export const acc3 = (a?: number) => token("acc-3", a);
export const onacc = (a?: number) => token("onacc", a);

export const line = "var(--line)";
export const lineStrong = "var(--line-strong)";
export const glass = "var(--glass)";
export const shadow = "var(--shadow)";

/* Swaps the theme class on <html> and remembers the choice. Shared by the
   header's appearance menu and the onboarding picker so the two can never
   drift apart. */
export function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  THEME_IDS.forEach((candidate) => root.classList.remove(`theme-${candidate}`));
  root.classList.add(`theme-${id}`);

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    /* Private browsing: the choice simply does not persist. */
  }
}

export function readTheme(): ThemeId {
  if (typeof document === "undefined") return DEFAULT_THEME;
  return (
    THEME_IDS.find((id) =>
      document.documentElement.classList.contains(`theme-${id}`),
    ) ?? DEFAULT_THEME
  );
}
