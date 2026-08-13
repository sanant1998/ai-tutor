export const A11Y_STORAGE_KEY = "mmr-a11y";

export type TextSize = "base" | "lg" | "xl";

export type A11yState = {
  dyslexia: boolean;
  readable: boolean;
  calm: boolean;
  contrast: boolean;
  textSize: TextSize;
};

export const DEFAULT_A11Y: A11yState = {
  dyslexia: false,
  readable: false,
  calm: false,
  contrast: false,
  textSize: "base",
};

export const A11Y_TOGGLES = [
  {
    key: "dyslexia",
    label: "Dyslexia-friendly font",
    hint: "Switches everything to Lexend.",
  },
  {
    key: "readable",
    label: "Readable spacing",
    hint: "Wider letters, taller lines.",
  },
  {
    key: "calm",
    label: "Calm mode",
    hint: "Stops animation and movement.",
  },
  {
    key: "contrast",
    label: "High contrast",
    hint: "Stronger text and outlines.",
  },
] as const satisfies readonly {
  key: keyof Omit<A11yState, "textSize">;
  label: string;
  hint: string;
}[];

export const TEXT_SIZES: { id: TextSize; label: string }[] = [
  { id: "base", label: "A" },
  { id: "lg", label: "A" },
  { id: "xl", label: "A" },
];

/* Reflects state onto <html>; the class names match the ported stylesheet. */
export function applyA11y(state: A11yState) {
  const root = document.documentElement;
  root.classList.toggle("a11y-dyslexia", state.dyslexia);
  root.classList.toggle("a11y-readable", state.readable);
  root.classList.toggle("a11y-calm", state.calm);
  root.classList.toggle("a11y-contrast", state.contrast);
  root.classList.toggle("a11y-text-lg", state.textSize === "lg");
  root.classList.toggle("a11y-text-xl", state.textSize === "xl");
}

export function readA11y(): A11yState {
  if (typeof window === "undefined") return DEFAULT_A11Y;
  try {
    const raw = window.localStorage.getItem(A11Y_STORAGE_KEY);
    if (!raw) return DEFAULT_A11Y;
    return { ...DEFAULT_A11Y, ...(JSON.parse(raw) as Partial<A11yState>) };
  } catch {
    return DEFAULT_A11Y;
  }
}
