/* Lets plain node import the app's modules by their "@/..." alias.
 *
 *   node --import ./scripts/register-alias.mjs evals/run.ts
 *
 * The alias is a bundler feature: it is declared in tsconfig.json and resolved
 * by webpack, neither of which is present when a script runs under node. The
 * eval harness needs the real prompt module — testing a copy of the prompt
 * would pass for ever while the prompt the students get quietly rotted — so
 * the alias has to work outside the bundler too.
 *
 * The alternative was to rewrite the imports in lib/prompt/tutor.ts as
 * relative paths with .ts extensions. That works under node and makes the app
 * code odd to read for the sake of a test harness, which is the wrong way
 * round.
 *
 * Type-only imports need nothing here: node strips them before resolution, so
 * a module whose only "@/" imports are types already loads. */

import { registerHooks } from "node:module";

const ROOT = new URL("../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);

    const base = new URL(specifier.slice(2), ROOT).href;

    /* tsconfig maps "@/*" to "./*" with no extension, so try the ones the
       repo actually uses, in the order the bundler would. */
    for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base]) {
      try {
        return nextResolve(candidate, context);
      } catch {
        /* Next candidate. */
      }
    }

    return nextResolve(specifier, context);
  },
});
