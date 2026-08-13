/* Deliberately empty.
 *
 * scripts/register-alias.mjs resolves "server-only" and "client-only" here.
 * Both packages exist purely to blow up at bundle time when a module crosses
 * the boundary it declared; neither has a runtime, and neither has anything to
 * assert about a node script. See the note in register-alias.mjs. */
export {};
