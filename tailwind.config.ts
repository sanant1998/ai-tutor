import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        /* Wired to the next/font variables declared in app/layout.tsx.
           `sans` is what Tailwind's preflight applies to the document, so
           setting it here makes DM Sans the default everywhere. */
        sans: ["var(--font-body)", '"DM Sans"', "sans-serif"],
        display: ["var(--font-display)", '"Bricolage Grotesque"', "sans-serif"],
        patrick: ["var(--font-patrick)", '"Patrick Hand"', "cursive"],
        hand: ["var(--font-hand)", "Caveat", "cursive"],
        lexend: ["var(--font-lexend)", "Lexend", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
