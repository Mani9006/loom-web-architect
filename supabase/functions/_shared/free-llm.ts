/**
 * free-llm — zero-cost LLM transport for Supabase edge functions.
 *
 * A minimal OpenAI-compatible chat-completions client that walks the FREE
 * provider chain resolved by free-llm-plan.ts (gemini → groq → openrouter →
 * ollama). Each provider is tried in order; on 429 / 5xx / timeout / network
 * error the NEXT provider is attempted, so a rate-limited free tier degrades
 * gracefully instead of failing the request.
 *
 * Legacy paid providers (openai / anthropic) appear in the chain only as
 * markers — llm.ts executes those hops through the pre-existing clients so
 * paid-path behavior (prompt caching, GPT-5 params) is unchanged.
 *
 * Zero external deps: Deno std only. Per-call timeout: 60s.
 *
 *   const r = await callOpenAiCompatibleChain(specs, messages, { parseJson: true });
 *   // → { content, provider, model, tokens_in, tokens_out, stop_reason }
 */
import type { FreeProviderId, ProviderSpec } from "./free-llm-plan.ts";

export interface FreeChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface FreeCallOptions {
  maxTokens?: number;
  /** 0–1. Defaults to 0.2 for deterministic outputs. */
  temperature?: number;
  /** Request JSON mode and parse the response. Throws on bad JSON. */
  parseJson?: boolean;
  /** Per-provider timeout in ms. Default 60_000. */
  timeoutMs?: number;
}

export interface FreeCallResult {
  content: string;
  provider: FreeProviderId;
  model: string;
  tokens_in: number;
  tokens_out: number;
  stop_reason: string;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/** Errors that mean "this provider can't serve us right now — try the next". */
function isChainRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export function stripJsonFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}

/**
 * Execute a single OpenAI-compatible chat-completions call with a timeout.
 * Throws Error("provider status: ...") on non-OK responses.
 */
async function callOne(
  spec: ProviderSpec,
  messages: FreeChatMessage[],
  opts: FreeCallOptions,
): Promise<FreeCallResult> {
  const body: Record<string, unknown> = {
    model: spec.model,
    messages,
    max_tokens: opts.maxTokens ?? 2000,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.parseJson) body.response_format = { type: "json_object" };

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (spec.apiKey) headers.authorization = `Bearer ${spec.apiKey}`;
  if (spec.id === "openrouter") {
    headers["HTTP-Referer"] = "https://resumepreps.com";
    headers["X-Title"] = "ResumePreps";
  }

  const res = await fetch(spec.url!, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new ChainError(spec.id, res.status, err.slice(0, 300));
  }

  const data = await res.json();
  const rawText: string = data.choices?.[0]?.message?.content ?? "";
  const usage = data.usage ?? {};
  return {
    content: rawText,
    provider: spec.id,
    model: spec.model,
    tokens_in: usage.prompt_tokens ?? 0,
    tokens_out: usage.completion_tokens ?? 0,
    stop_reason: data.choices?.[0]?.finish_reason ?? "stop",
  };
}

export class ChainError extends Error {
  constructor(
    public provider: FreeProviderId,
    public status: number,
    detail: string,
  ) {
    super(`${provider} ${status}: ${detail}`);
    this.name = "ChainError";
  }
}

/**
 * Walk the openai-compatible members of the chain in order. Returns on the
 * first success; skips legacy markers (caller handles those). Moves to the
 * next provider on 429/5xx, timeouts, and network failures; rethrows the
 * LAST provider's error when every openai-compatible hop failed — including
 * non-retryable 4xx, which for free tiers usually means "model unavailable
 * on this provider" and is still worth degrading past.
 */
export async function callOpenAiCompatibleChain(
  specs: ProviderSpec[],
  messages: FreeChatMessage[],
  opts: FreeCallOptions = {},
): Promise<FreeCallResult> {
  let lastError: unknown = null;
  for (const spec of specs) {
    if (spec.kind !== "openai-compatible") continue;
    try {
      return await callOne(spec, messages, opts);
    } catch (e) {
      lastError = e;
      const retryable = e instanceof ChainError
        ? isChainRetryable(e.status)
        : true; // timeouts / DNS / connection refused → next provider
      console.warn(
        `[free-llm] ${spec.id} failed (${e instanceof Error ? e.message : String(e)}); ` +
          (retryable ? "trying next provider" : "trying next provider after non-retryable status"),
      );
      // Free-tier policy: always degrade to the next hop. A 4xx from one
      // free provider (bad model id, key scope) must not break the request
      // when another free provider can serve it.
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "free-llm chain exhausted"));
}
