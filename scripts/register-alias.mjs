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
 * a module whose only "@/" imports are types already loads.
 *
 * ---------------------------------------------------------------------------
 * AND "server-only", WHICH IS NOT A REAL DEPENDENCY
 *
 * `import "server-only"` is a build-time assertion: the package's whole body
 * is a throw, and bundling it into a browser build is what is supposed to fail.
 * Under plain node the throw fires anyway — the package cannot tell a script
 * from a client bundle — so every module that guards itself this way was
 * unimportable from a script, which is most of lib/.
 *
 * A script is not a browser, so the assertion has nothing to say here and is
 * resolved to an empty module. This is not a loosening: the guard still fires
 * for real client bundles, which is the only place it ever meant anything. */

import { registerHooks } from "node:module";

const ROOT = new URL("../", import.meta.url);
const EMPTY = new URL("./empty-module.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only" || specifier === "client-only") {
      return { url: EMPTY, shortCircuit: true };
    }

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
