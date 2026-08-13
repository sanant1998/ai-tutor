/* Server-only model access, provider-agnostic.

   Every route calls `structured()`, which forces the model to answer by
   calling a tool whose schema is the shape we want. That is stricter than
   asking for JSON in prose: the provider validates the arguments before we
   see them, so a route never parses a half-written object.

   Two backends cover the field:

     anthropic  — the Claude API, native.
     openai     — any OpenAI-compatible /chat/completions endpoint. That is
                  OpenAI itself, Google Gemini's compat endpoint, OpenRouter,
                  Groq, DeepSeek, Together, or a local Ollama.

   Switching provider is env only; no route changes. See .env.example for
   working recipes. */

import "server-only";

import Anthropic from "@anthropic-ai/sdk";

type Provider = "anthropic" | "openai";

/* AI_* is the current spelling. ANTHROPIC_API_KEY is still read so an
   existing deployment keeps working without an edit. */
const KEY = process.env.AI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "";

const PROVIDER: Provider =
  (process.env.AI_PROVIDER as Provider) ??
  (process.env.ANTHROPIC_API_KEY ? "anthropic" : "anthropic");

const BASE_URL = process.env.AI_BASE_URL ?? "";

export const AI_MODEL =
  process.env.AI_MODEL ??
  process.env.ANTHROPIC_MODEL ??
  (PROVIDER === "anthropic" ? "claude-sonnet-5" : "gpt-4o-mini");

export const isAiConfigured = Boolean(KEY);

export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type StructuredCall = {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  toolName: string;
  toolDescription: string;
  maxTokens?: number;
  /* Per-call model override. Marking and diagram work are harder than
     prose generation, so a deployment can spend more on those two without
     paying the same rate for every note page. */
  model?: string;
};

export async function structured<T>(call: StructuredCall): Promise<T> {
  if (!isAiConfigured) {
    throw new AiError(
      "No model API key is set on the server. Set AI_API_KEY.",
      503,
    );
  }

  return PROVIDER === "openai"
    ? viaOpenAiCompatible<T>(call)
    : viaAnthropic<T>(call);
}

/* --------------------------------------------------------------------------
   Anthropic
   -------------------------------------------------------------------------- */
let anthropic: Anthropic | null = null;

async function viaAnthropic<T>(call: StructuredCall): Promise<T> {
  const { system, prompt, schema, toolName, toolDescription, maxTokens = 4096 } = call;
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: KEY,
      ...(BASE_URL ? { baseURL: BASE_URL } : {}),
    });
  }

  let message;
  try {
    message = await anthropic.messages.create({
      model: call.model ?? AI_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: toolName,
          description: toolDescription,
          input_schema: schema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: toolName },
    });
  } catch (error) {
    throw wrap(error);
  }

  const block = message.content.find((part) => part.type === "tool_use");

  if (!block || block.type !== "tool_use") {
    throw new AiError("The model did not return a structured answer.", 502);
  }

  return block.input as T;
}

/* --------------------------------------------------------------------------
   OpenAI-compatible

   Plain fetch rather than a second SDK: the surface we need is one POST, and
   the compatible providers differ enough at the edges that owning the request
   is easier than fighting a client's assumptions.
   -------------------------------------------------------------------------- */
async function viaOpenAiCompatible<T>({
  system,
  prompt,
  schema,
  toolName,
  toolDescription,
  maxTokens = 4096,
  model,
}: StructuredCall): Promise<T> {
  const base = (BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

  const send = (tokenField: "max_tokens" | "max_completion_tokens") =>
    fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({
        model: model ?? AI_MODEL,
        [tokenField]: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: toolName,
              description: toolDescription,
              parameters: schema,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: toolName } },
      }),
    });

  let response: Response;
  try {
    /* `max_tokens` is what the compatible ecosystem accepts — Groq, Gemini's
       compat endpoint, OpenRouter, Ollama. OpenAI's newer models reject it and
       demand `max_completion_tokens`. Rather than keep a list of which model
       wants which, ask once and retry on the one error that says so. */
    response = await send("max_tokens");

    if (response.status === 400) {
      const detail = await response.clone().text().catch(() => "");
      if (detail.includes("max_completion_tokens")) {
        response = await send("max_completion_tokens");
      }
    }
  } catch {
    throw new AiError("Could not reach the model provider.", 502);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AiError(
      detail.slice(0, 300) || `Provider returned ${response.status}.`,
      response.status,
    );
  }

  const payload = (await response.json()) as {
    choices?: {
      message?: {
        tool_calls?: { function?: { arguments?: string } }[];
      };
    }[];
  };

  const args = payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;

  if (!args) {
    throw new AiError("The model did not return a structured answer.", 502);
  }

  try {
    return JSON.parse(args) as T;
  } catch {
    throw new AiError("The model returned arguments that were not JSON.", 502);
  }
}

/* Surface the upstream status so a rate limit reads as a rate limit rather
   than a generic 500 the student cannot act on. */
function wrap(error: unknown) {
  const status =
    error instanceof Anthropic.APIError && error.status ? error.status : 502;

  return new AiError(
    error instanceof Error ? error.message : "Upstream request failed.",
    status,
  );
}
