/* Streaming model access, with a fallback and a bill attached to every call.

   lib/ai/client.ts covers the structured, non-streaming calls — marking,
   classification, question writing. Teaching cannot use it: a student staring
   at a spinner for eight seconds decides the app is broken, and the fix is not
   a faster model, it is showing the first sentence while the rest is still
   being written.

   Three things this file does that a plain SDK call does not:

     ROUTING   quality where it shows. Teaching and checking get the strong
               model; summaries and classification get the cheap one. The
               difference is most of the bill and none of the experience.

     FALLBACK  if the primary provider errors, or produces nothing at all
               within a few seconds, the secondary takes over mid-stream. A
               provider incident should cost a student a slower reply, not a
               lost lesson.

     LOGGING   one llm_calls row per call, always, including the failures.
               Without it there is no answer to "what does a taught concept
               cost", and that number decides whether the subscription price
               works. */

import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { AiError } from "@/lib/ai/client";
import { sendCompatible } from "@/lib/ai/compat";
import { track } from "@/lib/analytics/events";
import { reportError } from "@/lib/observability";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export type Purpose = "teach" | "check" | "classify" | "solve" | "summary";

export type StreamRequest = {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  temperature?: number;
  purpose: Purpose;
  /* Recorded on the llm_calls row so a cost spike can be traced to a student
     or a session rather than to "the app". */
  userId?: string;
  sessionId?: string;
};

export type Chunk = { text: string };

export type StreamResult = {
  text: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  fellBack: boolean;
};

/* --------------------------------------------------------------------------
   Configuration

   Provider names come from the environment and not from code, so switching
   provider — or moving one purpose to a cheaper model after seeing the bill —
   is a redeploy of config rather than an edit.
   -------------------------------------------------------------------------- */
type Kind = "anthropic" | "openai";

type Endpoint = {
  kind: Kind;
  key: string;
  baseUrl: string;
  /* The two tiers a route can ask for. */
  strong: string;
  fast: string;
  name: string;
};

function primary(): Endpoint | null {
  const key = process.env.AI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "";
  if (!key) return null;

  const kind = (process.env.AI_PROVIDER as Kind) ?? "anthropic";

  return {
    kind,
    key,
    baseUrl: process.env.AI_BASE_URL ?? "",
    strong:
      process.env.AI_MODEL_STRONG ??
      process.env.AI_MODEL ??
      process.env.ANTHROPIC_MODEL ??
      (kind === "anthropic" ? "claude-sonnet-5" : "gpt-4o-mini"),
    fast:
      process.env.AI_MODEL_FAST ??
      process.env.AI_MODEL ??
      (kind === "anthropic" ? "claude-haiku-4-5-20251001" : "gpt-4o-mini"),
    name: process.env.AI_PROVIDER ?? "anthropic",
  };
}

function secondary(): Endpoint | null {
  const key = process.env.AI_FALLBACK_API_KEY ?? "";
  if (!key) return null;

  const kind = (process.env.AI_FALLBACK_PROVIDER as Kind) ?? "openai";

  return {
    kind,
    key,
    baseUrl: process.env.AI_FALLBACK_BASE_URL ?? "",
    strong: process.env.AI_FALLBACK_MODEL ?? "gemini-2.5-flash",
    fast: process.env.AI_FALLBACK_MODEL ?? "gemini-2.5-flash",
    name: process.env.AI_FALLBACK_PROVIDER ?? "openai",
  };
}

/* Which tier each purpose deserves. Teaching and checking are the two the
   student judges the product on; the rest can be cheap without anyone
   noticing. */
const TIER: Record<Purpose, "strong" | "fast"> = {
  teach: "strong",
  check: "strong",
  summary: "fast",
  solve: "fast",
  classify: "fast",
};

/* How long a provider may produce nothing before the fallback takes over. Not
   a total timeout — a long answer is fine — a FIRST-TOKEN one, because silence
   is the only symptom a student can see. */
const FIRST_TOKEN_MS = Number(process.env.AI_FIRST_TOKEN_TIMEOUT_MS ?? 6000);

export function isStreamConfigured() {
  return primary() !== null;
}

/* --------------------------------------------------------------------------
   The public call
   -------------------------------------------------------------------------- */
export async function* stream(
  request: StreamRequest,
): AsyncGenerator<Chunk, StreamResult, void> {
  const first = primary();
  if (!first) {
    throw new AiError("No model API key is set on the server. Set AI_API_KEY.", 503);
  }

  const started = Date.now();
  const model = first[TIER[request.purpose]];

  let text = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let fellBack = false;
  let usedProvider = first.name;
  let usedModel = model;

  try {
    for await (const chunk of run(first, model, request)) {
      if (chunk.text) {
        text += chunk.text;
        yield { text: chunk.text };
      }
      tokensIn = chunk.tokensIn ?? tokensIn;
      tokensOut = chunk.tokensOut ?? tokensOut;
    }
  } catch (error) {
    const backup = secondary();

    /* Only fall back before anything has been shown. Switching provider
       mid-sentence produces a reply that changes voice and repeats itself,
       which reads worse to a student than a clean error. */
    if (!backup || text.length > 0) {
      await log(request, {
        provider: usedProvider,
        model: usedModel,
        tokensIn,
        tokensOut,
        latencyMs: Date.now() - started,
        fellBack,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error instanceof AiError
        ? error
        : new AiError("The model provider failed.", 502);
    }

    fellBack = true;
    usedProvider = backup.name;
    usedModel = backup[TIER[request.purpose]];

    /* One of the four health numbers with an alert behind it. A fallback that
       fires occasionally is the system working; one that fires constantly is a
       primary provider that has quietly stopped being usable, and the llm_calls
       row alone would not surface that until someone read the table. */
    track({
      name: "provider_fell_back",
      from: first.name,
      to: backup.name,
      purpose: request.purpose,
    });

    try {
      for await (const chunk of run(backup, usedModel, request)) {
        if (chunk.text) {
          text += chunk.text;
          yield { text: chunk.text };
        }
        tokensIn = chunk.tokensIn ?? tokensIn;
        tokensOut = chunk.tokensOut ?? tokensOut;
      }
    } catch (fallbackError) {
      await log(request, {
        provider: usedProvider,
        model: usedModel,
        tokensIn,
        tokensOut,
        latencyMs: Date.now() - started,
        fellBack: true,
        ok: false,
        error:
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });

      await reportError("ai.both_providers_failed", fallbackError, {
        purpose: request.purpose,
        primary: first.name,
        fallback: backup.name,
      });

      throw new AiError("Both model providers failed.", 502);
    }
  }

  const result: StreamResult = {
    text,
    provider: usedProvider,
    model: usedModel,
    tokensIn,
    tokensOut,
    latencyMs: Date.now() - started,
    fellBack,
  };

  await log(request, { ...result, ok: true });

  return result;
}

/* --------------------------------------------------------------------------
   Providers
   -------------------------------------------------------------------------- */
type RawChunk = { text?: string; tokensIn?: number; tokensOut?: number };

function run(
  endpoint: Endpoint,
  model: string,
  request: StreamRequest,
): AsyncGenerator<RawChunk> {
  const source =
    endpoint.kind === "anthropic"
      ? viaAnthropic(endpoint, model, request)
      : viaOpenAiCompatible(endpoint, model, request);

  return withFirstTokenDeadline(source, FIRST_TOKEN_MS);
}

async function* viaAnthropic(
  endpoint: Endpoint,
  model: string,
  request: StreamRequest,
): AsyncGenerator<RawChunk> {
  const client = new Anthropic({
    apiKey: endpoint.key,
    ...(endpoint.baseUrl ? { baseURL: endpoint.baseUrl } : {}),
  });

  const response = await client.messages.create({
    model,
    max_tokens: request.maxTokens ?? 1024,
    temperature: request.temperature ?? 0.6,
    /* The system prompt is identical on every teaching call, so marking it
       cacheable turns most of the input cost into a cache read. On a ten-turn
       session that is the difference between the content pack being free and
       being the largest line on the bill. */
    system: [
      { type: "text", text: request.system, cache_control: { type: "ephemeral" } },
    ],
    messages: request.messages,
    stream: true,
  });

  for await (const event of response) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { text: event.delta.text };
    }

    if (event.type === "message_start") {
      const usage = event.message.usage;
      yield {
        tokensIn:
          usage.input_tokens +
          (usage.cache_creation_input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0),
      };
    }

    if (event.type === "message_delta") {
      yield { tokensOut: event.usage.output_tokens };
    }
  }
}

async function* viaOpenAiCompatible(
  endpoint: Endpoint,
  model: string,
  request: StreamRequest,
): AsyncGenerator<RawChunk> {
  const base = (endpoint.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");

  /* Through sendCompatible: OpenAI's reasoning models reject `max_tokens` and
     a non-default `temperature`, and both say so in the 400. Without this,
     pointing AI_MODEL_STRONG at one of them breaks every tutor turn with
     "Unsupported parameter" — which is exactly what happened. */
  const response = await sendCompatible((shape) =>
    fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${endpoint.key}`,
      },
      body: JSON.stringify({
        model,
        [shape.tokenField]: request.maxTokens ?? 1024,
        ...(shape.temperature ? { temperature: request.temperature ?? 0.6 } : {}),
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: "system", content: request.system },
          ...request.messages,
        ],
      }),
    }),
  );

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new AiError(
      detail.slice(0, 300) || `Provider returned ${response.status}.`,
      response.status,
    );
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += value;

    /* SSE frames are separated by a blank line, and a frame can arrive split
       across reads. Keep the trailing partial frame in the buffer. */
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.split("\n").find((part) => part.startsWith("data:"));
      if (!line) continue;

      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;

      let parsed: {
        choices?: { delta?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) yield { text: delta };

      if (parsed.usage) {
        yield {
          tokensIn: parsed.usage.prompt_tokens ?? 0,
          tokensOut: parsed.usage.completion_tokens ?? 0,
        };
      }
    }
  }
}

/* Rejects if the provider has not produced its first chunk in time. Once it
   has, the deadline is gone and a long answer streams to completion. */
async function* withFirstTokenDeadline(
  source: AsyncGenerator<RawChunk>,
  ms: number,
): AsyncGenerator<RawChunk> {
  let seen = false;

  while (true) {
    const next = seen
      ? await source.next()
      : await Promise.race([
          source.next(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new AiError(`No response within ${ms}ms.`, 504)),
              ms,
            ),
          ),
        ]);

    if (next.done) return;
    if (next.value.text) seen = true;
    yield next.value;
  }
}

/* --------------------------------------------------------------------------
   Cost

   Rates in INR per million tokens, so the ledger reads in the currency the
   business is priced in. Approximate on purpose: the number that matters is
   the trend and the per-student average, and both survive a stale exchange
   rate. Override with AI_RATE_IN / AI_RATE_OUT when a real rate card is known.
   -------------------------------------------------------------------------- */
const RATE_INR_PER_MTOK: Record<string, { in: number; out: number }> = {
  "claude-opus": { in: 1250, out: 6250 },
  "claude-sonnet": { in: 250, out: 1250 },
  "claude-haiku": { in: 70, out: 350 },
  "gemini-2.5-flash": { in: 25, out: 210 },
  "gpt-4o-mini": { in: 12, out: 50 },
};

export function estimateCostInr(model: string, tokensIn: number, tokensOut: number) {
  const override = process.env.AI_RATE_IN && process.env.AI_RATE_OUT;
  const rate = override
    ? { in: Number(process.env.AI_RATE_IN), out: Number(process.env.AI_RATE_OUT) }
    : (Object.entries(RATE_INR_PER_MTOK).find(([prefix]) =>
        model.toLowerCase().includes(prefix),
      )?.[1] ?? null);

  if (!rate) return null;

  return Number(
    ((tokensIn / 1_000_000) * rate.in + (tokensOut / 1_000_000) * rate.out).toFixed(4),
  );
}

/* The money side of the same call.
 *
 * credit_ledger existed from the first migration and nothing had ever written
 * a row, which made "free tier abuse control" a table rather than a feature.
 * ai_usage counts ACTIONS per day; this counts rupees, and they diverge the
 * moment one student's turns are three times as expensive as another's — which
 * is exactly what a long reteach chain produces.
 *
 * Debits only. Grants are written by the billing webhook and by hand. */
async function debit(
  userId: string | undefined,
  costInr: number | null,
  purpose: string,
) {
  if (!userId || !costInr || costInr <= 0 || !isAdminConfigured()) return;

  try {
    await createAdminClient().from("credit_ledger").insert({
      user_id: userId,
      /* Negative: the ledger sums to a balance, and a spend that increases it
         is a ledger nobody can read. */
      delta: -costInr,
      reason: `llm:${purpose}`,
    });
  } catch {
    /* Never able to break a lesson. */
  }
}

async function log(
  request: StreamRequest,
  outcome: {
    provider: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    fellBack: boolean;
    ok: boolean;
    error?: string;
  },
) {
  if (!isAdminConfigured()) return;

  try {
    const cost = estimateCostInr(outcome.model, outcome.tokensIn, outcome.tokensOut);

    await debit(request.userId, cost, request.purpose);

    await createAdminClient()
      .from("llm_calls")
      .insert({
        user_id: request.userId ?? null,
        session_id: request.sessionId ?? null,
        purpose: request.purpose,
        provider: outcome.provider,
        model: outcome.model,
        tokens_in: outcome.tokensIn,
        tokens_out: outcome.tokensOut,
        cost_inr: cost,
        latency_ms: outcome.latencyMs,
        fell_back: outcome.fellBack,
        ok: outcome.ok,
        error: outcome.error ?? null,
      });
  } catch {
    /* Never fail a lesson because the meter could not be written. */
  }
}
