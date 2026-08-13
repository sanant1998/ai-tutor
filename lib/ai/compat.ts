/* The two ways an OpenAI-compatible endpoint rejects a request for saying it
   the old way.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ITS OWN FILE
 *
 * `max_tokens` is what the compatible ecosystem accepts — Groq, Gemini's
 * compat endpoint, OpenRouter, Ollama, and every OpenAI model up to 4o.
 * OpenAI's reasoning models reject it and demand `max_completion_tokens`, and
 * separately reject any `temperature` other than the default.
 *
 * Neither is a real error. Both name their own fix in the message, and the
 * only sane response is to say it the other way and go again.
 *
 * This lived in lib/ai/client.ts alone, and the cost of that showed up three
 * times in one afternoon:
 *
 *   scripts/author-concept.ts   had its own Anthropic client and ignored
 *                               AI_PROVIDER entirely
 *   evals/run.ts                had its own fetch, so the golden set failed
 *                               on all fifteen rows the first time it ever ran
 *   lib/ai/stream.ts            had its own fetch, so setting AI_MODEL_STRONG
 *                               to a reasoning model broke the live tutor —
 *                               every turn came back "Unsupported parameter"
 *
 * Three modules knowing two facts, and each learning them separately. The
 * facts live here now.
 *
 * ---------------------------------------------------------------------------
 * THE CALLER OWNS THE REQUEST
 *
 * A shape goes in, a Response comes out; what is in the body is nobody's
 * business here. That is what lets a streaming call, a tool call and a plain
 * completion share it — they agree about these two parameters and about
 * nothing else.
 *
 * No "server-only": evals/run.ts imports this under plain node. */

export type CompatShape = {
  tokenField: "max_tokens" | "max_completion_tokens";
  /* False once the endpoint has said it only accepts the default. */
  temperature: boolean;
};

export function defaultShape(): CompatShape {
  return { tokenField: "max_tokens", temperature: true };
}

/* Sends, and retries at most twice — once per fact, and only when the 400
   names it. Anything else is a real error and comes straight back for the
   caller to handle. */
export async function sendCompatible(
  send: (shape: CompatShape) => Promise<Response>,
): Promise<Response> {
  const shape = defaultShape();

  let response = await send(shape);

  for (let attempt = 0; attempt < 2 && response.status === 400; attempt += 1) {
    /* Cloned: the body is read again by the caller when this turns out to be
       a real failure, and a Response body can only be read once. */
    const detail = await response.clone().text().catch(() => "");

    if (detail.includes("max_completion_tokens") && shape.tokenField === "max_tokens") {
      shape.tokenField = "max_completion_tokens";
    } else if (detail.includes("'temperature'") && shape.temperature) {
      shape.temperature = false;
    } else {
      break;
    }

    response = await send(shape);
  }

  return response;
}
