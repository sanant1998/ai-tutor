/* Lint, which this project did not have.
 *
 * `npm run lint` ran `next lint` against no configuration at all, so it opened
 * an interactive "how would you like to configure ESLint?" prompt and hung.
 * CI never called it, which is why nobody noticed — and why a handful of
 * things a linter catches in a second sat in the tree for as long as they did:
 * an unused import in the analytics route, a dead branch in the safety gate
 * where both arms returned the same value, a variable literally named `any`,
 * and an `x ? "anthropic" : "anthropic"` in the model client.
 *
 * Flat config, because `next lint` is deprecated and removed in Next 16; the
 * script now calls the ESLint CLI directly.
 *
 * The rules below are deliberately short. A lint configuration that fires on
 * style is a lint configuration people learn to run with --fix and stop
 * reading, and the value here is entirely in the correctness rules.
 */

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "public/sw.js",
      "**/*.tsbuildinfo",
      /* Browser-tool scratch. Gitignored, so CI never sees it — without this
         line a local `npm run lint` reports errors CI cannot reproduce, and a
         lint gate the developer learns to ignore locally is not a gate. */
      ".playwright-mcp/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx,mjs}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,

      /* The ones that earn their place. */
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
      /* `x ? "a" : "a"`, `if (c) return X; return X;` — the shape of a
         half-finished edit. */
      "no-dupe-else-if": "error",
      "no-constant-binary-expression": "error",
      /* A floating promise in a route handler is a write that may not have
         happened by the time the response is sent. */
      "no-void": "off",
      /* `as any` is sometimes the honest answer at a database boundary, so it
         warns rather than fails — but it is never invisible. */
      "@typescript-eslint/no-explicit-any": "warn",

      /* --- Advisory, on purpose ------------------------------------------
       *
       * The rules below fire on patterns this app uses deliberately and
       * documents. They stay on as warnings because a few of the hits are
       * worth revisiting; they are not errors because thirty-odd failures on
       * an intentional architecture is how a team learns to run lint with
       * --quiet and then not at all.
       *
       * set-state-in-effect — the app paints from localStorage after mount
       *   rather than during render, which is the whole reason there is no
       *   hydration mismatch and no loading flash. See lib/useAppData.ts.
       *
       * purity / immutability / preserve-manual-memoization — React Compiler
       *   diagnostics. Real signal, but each one needs a judgement call about
       *   a working screen rather than a mechanical fix.
       *
       * no-location-assign-relative-destination — three of these are
       *   deliberate FULL page loads after an auth or consent change, where a
       *   client-side transition would repaint from a stale Server Component
       *   cache. See components/app/SignOutButton.tsx.
       *
       * no-useless-assignment — initialising a `let` that every branch
       *   overwrites is a readability choice, not a defect. */
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "@next/next/no-location-assign-relative-destination": "warn",
      "no-useless-assignment": "warn",
    },
  },

  /* Scripts and evals run under plain node with no DOM. */
  {
    files: ["scripts/**", "evals/**", "*.mjs"],
    languageOptions: { globals: globals.node },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
