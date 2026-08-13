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

import { sendCompatible, type CompatShape } from "@/lib/ai/compat";

type Provider = "anthropic" | "openai";

/* AI_* is the current spelling. ANTHROPIC_API_KEY is still read so an
   existing deployment keeps working without an edit. */
const KEY = process.env.AI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "";

/* Validated rather than cast.
 *
 * This was `(process.env.AI_PROVIDER as Provider) ?? (ANTHROPIC_API_KEY ?
 * "anthropic" : "anthropic")` — a ternary whose branches were identical, so
 * the fallback was decorative, and a straight cast on the env var, so a typo
 * (`AI_PROVIDER=openrouter`, `AI_PROVIDER=OpenAI`) silently selected the
 * Anthropic path and produced an authentication error against the wrong API.
 * The failure named the key, not the setting, which is a bad half-hour. */
const PROVIDERS: Provider[] = ["anthropic", "openai"];

function resolveProvider(): Provider {
  const configured = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();

  if (!configured) return "anthropic";

  if (!PROVIDERS.includes(configured as Provider)) {
    console.warn(
      `[ai] AI_PROVIDER="${process.env.AI_PROVIDER}" is not one of ${PROVIDERS.join(", ")}. Falling back to anthropic. Any OpenAI-compatible endpoint uses AI_PROVIDER=openai with AI_BASE_URL.`,
    );
    return "anthropic";
  }

  return configured as Provider;
}

const PROVIDER: Provider = resolveProvider();

const BASE_URL = process.env.AI_BASE_URL ?? "";

export const AI_MODEL =
  process.env.AI_MODEL ??
  process.env.ANTHROPIC_MODEL ??
  (PROVIDER === "anthropic" ? "claude-sonnet-5" : "gpt-4o-mini");

export const isAiConfigured = Boolean(KEY);

/* `readonly status` is assigned in the body rather than declared as a
   constructor parameter property.
 *
 * A parameter property is one of the few TypeScript features that emits
 * runtime code, so node's strip-only type stripping refuses it outright:
 * `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: TypeScript parameter property is not
 * supported in strip-only mode`. That made this whole module unimportable from
 * any script run under plain node — which is every script in scripts/ — even
 * though the app bundles it fine.
 *
 * It is why scripts/author-concept.ts carried its own hand-rolled Anthropic
 * client instead of calling structured(), and why that script silently ignored
 * AI_PROVIDER. Two lines longer here, and the one model client works
 * everywhere. */
export class AiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/* A page image, base64, for the chapter import's scanned-PDF path.
 *
 * Text is always preferred and is what every other caller sends. Images exist
 * because a teacher photographing a textbook page is a real and common thing,
 * and the alternative to reading it is telling them the feature does not work
 * for the file they have. */
export type ImageInput = {
  /* image/png or image/jpeg. */
  mediaType: string;
  base64: string;
};

export type StructuredCall = {
  system: string;
  prompt: string;
  /* Sent alongside the prompt when present. Both backends take images in the
     user turn; the shape differs, which is what this module is for. */
  images?: ImageInput[];
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
      /* Images first, then the instruction. Both providers attend better to a
         prompt that comes after the thing it is about than before it. */
      messages: [
        {
          role: "user",
          content: call.images?.length
            ? [
                ...call.images.map((image) => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: image.mediaType as "image/png" | "image/jpeg",
                    data: image.base64,
                  },
                })),
                { type: "text" as const, text: prompt },
              ]
            : prompt,
        },
      ],
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
  images,
  schema,
  toolName,
  toolDescription,
  maxTokens = 4096,
  model,
}: StructuredCall): Promise<T> {
  const base = (BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

  const send = (shape: CompatShape) =>
    fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({
        model: model ?? AI_MODEL,
        [shape.tokenField]: maxTokens,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: images?.length
              ? [
                  ...images.map((image) => ({
                    type: "image_url",
                    image_url: { url: `data:${image.mediaType};base64,${image.base64}` },
                  })),
                  { type: "text", text: prompt },
                ]
              : prompt,
          },
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
    /* The retry that used to live here is in lib/ai/compat.ts now, because
       three modules needed it and each had to learn it the hard way. */
    response = await sendCompatible(send);
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
