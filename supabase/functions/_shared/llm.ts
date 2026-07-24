/**
 * Unified multi-provider LLM router.
 *
 * Sits on top of provider-specific clients (Anthropic via ai.ts, OpenAI here).
 * Pick a `tier` and the router resolves to a concrete model. Provider is
 * OpenAI by default and can be overridden per call or globally via env.
 *
 *   const { text, tokens_in, tokens_out } = await callLlm({
 *     tier: "standard",
 *     system: "Rewrite the bullet for impact.",
 *     user: bullet,
 *   });
 *
 * Tier policy (set by product 2026-05-12):
 *   cheap     →  routine extraction, classification, short rewrites
 *   standard  →  resume tailoring, scoring, cover letter drafts
 *   hard      →  rare — reasoning-heavy, multi-step planning
 *
 * Models are picked from env-overridable defaults so we can swap without
 * code changes when a new model ships.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaude, type Tier as AnthropicTier } from "./ai.ts";
import { logAiUsage, type UsageKind } from "./guards.ts";
import {
  type FreeProviderId,
  type FreeTier,
  hasFreeProvider,
  planFreeChain,
} from "./free-llm-plan.ts";
import {
  callOpenAiCompatibleChain,
  type FreeChatMessage,
  stripJsonFences,
} from "./free-llm.ts";

export type Tier = "cheap" | "standard" | "hard";
export type Provider = "anthropic" | "openai";

const ANTHROPIC_TIER_MAP: Record<Tier, AnthropicTier> = {
  cheap: "simple",
  standard: "complex",
  hard: "research",
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function envModel(key: string, fallback: string): string {
  return Deno.env.get(key) ?? fallback;
}

function openaiModelFor(tier: Tier): string {
  switch (tier) {
    case "cheap":    return envModel("OPENAI_MODEL_CHEAP", "gpt-5.4-nano");
    case "standard": return envModel("OPENAI_MODEL_STANDARD", "gpt-5.4-mini");
    case "hard":     return envModel("OPENAI_MODEL_HARD", "gpt-5.4-mini");
  }
}

function defaultProvider(): Provider {
  const v = (Deno.env.get("LLM_DEFAULT_PROVIDER") ?? "openai").toLowerCase();
  return v === "openai" ? "openai" : "anthropic";
}

const DEFAULT_MAX: Record<Tier, number> = {
  cheap: 800,
  standard: 2000,
  hard: 3000,
};

export interface LlmCallOptions {
  tier: Tier;
  /** Narrow workload-specific model override; tier defaults remain unchanged. */
  model?: string;
  /** Override provider; otherwise uses LLM_DEFAULT_PROVIDER or OpenAI. */
  provider?: Provider;
  /** System prompt — always cached when supported. */
  system: string;
  /**
   * Long, slow-changing context (resume markdown, job description). Cached
   * when supported. Prefer this over inlining large strings into `user`.
   */
  cachedContext?: string;
  /** The varying user instruction. */
  user: string;
  maxTokens?: number;
  /** 0–1. Defaults to 0.2 for deterministic outputs. */
  temperature?: number;
  /** If set, response is parsed as JSON. Throws on bad JSON. */
  parseJson?: boolean;
  /**
   * Optional cost-logging hook. If provided, calls logAiUsage after the LLM
   * returns so daily quotas and cost dashboards stay accurate.
   */
  usage?: {
    svc: SupabaseClient;
    userId: string;
    kind: UsageKind;
  };
}

export interface LlmCallResult<T = string> {
  text: T;
  tokens_in: number;
  tokens_out: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  model: string;
  provider: Provider;
  stop_reason: string;
}

export async function callLlm<T = string>(opts: LlmCallOptions): Promise<LlmCallResult<T>> {
  const provider = opts.provider ?? defaultProvider();
  const result = provider === "openai"
    ? await callOpenAi<T>(opts)
    : await callAnthropic<T>(opts);

  if (opts.usage) {
    try {
      await logAiUsage(opts.usage.svc, opts.usage.userId, opts.usage.kind, result.tokens_in, result.tokens_out);
    } catch {
      // Usage logging is best-effort; don't fail the call if the RPC errors.
    }
  }

  return result;
}

async function callAnthropic<T>(opts: LlmCallOptions): Promise<LlmCallResult<T>> {
  const r = await callClaude<T>({
    tier: ANTHROPIC_TIER_MAP[opts.tier],
    system: opts.system,
    cachedContext: opts.cachedContext,
    user: opts.user,
    maxTokens: opts.maxTokens ?? DEFAULT_MAX[opts.tier],
    temperature: opts.temperature,
    parseJson: opts.parseJson,
  });
  return { ...r, provider: "anthropic" };
}

async function callOpenAi<T>(opts: LlmCallOptions): Promise<LlmCallResult<T>> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  const model = opts.model ?? openaiModelFor(opts.tier);
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX[opts.tier];
  const isGpt5 = /^gpt-5(?:\.|-|$)/i.test(model);

  const systemContent = opts.cachedContext
    ? `${opts.system}\n\n---\n\n${opts.cachedContext}`
    : opts.system;

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: opts.user },
    ],
  };
  if (isGpt5) {
    // GPT-5 family models use the newer completion-token parameter and do not
    // need a sampling temperature for these deterministic product workflows.
    body.max_completion_tokens = maxTokens;
  } else {
    body.max_tokens = maxTokens;
    body.temperature = opts.temperature ?? 0.2;
  }
  if (opts.parseJson) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`openai ${res.status}: ${err.slice(0, 500)}`);
  }

  const data = await res.json();
  const rawText: string = data.choices?.[0]?.message?.content ?? "";
  const usage = data.usage ?? {};
  const tokens_in = usage.prompt_tokens ?? 0;
  const tokens_out = usage.completion_tokens ?? 0;
  const cache_read_tokens = usage.prompt_tokens_details?.cached_tokens ?? 0;

  let text: unknown = rawText;
  if (opts.parseJson) {
    const cleaned = rawText.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      text = JSON.parse(cleaned);
    } catch {
      throw new Error(`openai returned non-JSON: ${cleaned.slice(0, 200)}`);
    }
  }

  return {
    text: text as T,
    tokens_in,
    tokens_out,
    cache_read_tokens,
    cache_write_tokens: 0,
    model,
    provider: "openai",
    stop_reason: data.choices?.[0]?.finish_reason ?? "stop",
  };
}

/**
 * Try a primary provider, fall back to the other on transient failures.
 * Use for user-facing requests where a 503 from one vendor shouldn't break
 * the product.
 */
export async function callLlmWithFallback<T = string>(opts: LlmCallOptions): Promise<LlmCallResult<T>> {
  const primary = opts.provider ?? defaultProvider();
  const secondary: Provider = primary === "anthropic" ? "openai" : "anthropic";
  try {
    return await callLlm<T>({ ...opts, provider: primary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Fall back on: transient infra failures, AND on "no credit" billing
    // errors (4xx with billing-related messages) — Anthropic returns 400 with
    // "credit balance is too low" when out of quota, which we want to route
    // through to the other provider rather than fail the user request.
    const isTransient = /\b(5\d\d|429|timeout|overloaded|rate.?limit)\b/i.test(msg);
    const isBillingDry = /(credit\s+balance|insufficient_quota|billing|out_of_credits|payment_required|402)/i.test(msg);
    const isProviderUnconfigured = /(api.?key.*(?:not configured|not set|missing)|not configured)/i.test(msg);
    if (!isTransient && !isBillingDry && !isProviderUnconfigured) throw e;
    return await callLlm<T>({ ...opts, provider: secondary });
  }
}

// ── Free-first routing (chatFree) ──────────────────────────────────────

export type ChatFreeTier = FreeTier | Tier;

export interface ChatFreeOptions {
  maxTokens?: number;
  /** 0–1. Defaults to 0.2 for deterministic outputs. */
  temperature?: number;
  /** If set, response is parsed as JSON. Throws on bad JSON. */
  parseJson?: boolean;
  /** Optional cost-logging hook, same semantics as LlmCallOptions.usage. */
  usage?: {
    svc: SupabaseClient;
    userId: string;
    kind: UsageKind;
  };
}

/** LlmCallResult with the provider widened to any chain member. */
export interface ChatFreeResult<T = string> extends Omit<LlmCallResult<T>, "provider"> {
  provider: FreeProviderId;
}

function freeTierFor(tier: ChatFreeTier): FreeTier {
  return tier === "lite" || tier === "cheap" ? "lite" : "standard";
}

function legacyTierFor(tier: ChatFreeTier): Tier {
  if (tier === "lite" || tier === "cheap") return "cheap";
  if (tier === "hard") return "hard";
  return "standard";
}

/** Rebuild legacy system/user opts from a messages array (system msgs join, user msgs join). */
function messagesToLegacy(
  tier: ChatFreeTier,
  messages: FreeChatMessage[],
  opts: ChatFreeOptions,
): LlmCallOptions {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const user = messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n\n");
  return {
    tier: legacyTierFor(tier),
    system,
    user,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    parseJson: opts.parseJson,
  };
}

/**
 * Free-first chat router. Walks the free provider chain (gemini → groq →
 * openrouter → ollama — see free-llm-plan.ts) and degrades to the next
 * provider on 429/5xx/timeouts. Legacy openai/anthropic chain entries run
 * through the EXISTING paid clients, so paid behavior is unchanged.
 *
 * BACKWARDS COMPATIBLE: when no free provider key is configured
 * (GEMINI_/GROQ_/OPENROUTER_API_KEY, OLLAMA_BASE_URL all unset) this falls
 * through to callLlmWithFallback, i.e. byte-for-byte the old paid behavior.
 *
 * Tier mapping: "lite"/"cheap" → lite free models; "standard"/"hard" →
 * standard free models.
 */
export async function chatFree<T = string>(
  tier: ChatFreeTier,
  messages: FreeChatMessage[],
  opts: ChatFreeOptions = {},
): Promise<ChatFreeResult<T>> {
  const chain = planFreeChain((k) => Deno.env.get(k), freeTierFor(tier));

  let result: ChatFreeResult<T>;

  if (!hasFreeProvider(chain)) {
    // No free keys at all → exact legacy behavior (provider from
    // LLM_DEFAULT_PROVIDER, cross-fallback on transient failures).
    const r = await callLlmWithFallback<T>(messagesToLegacy(tier, messages, opts));
    result = r as ChatFreeResult<T>;
  } else {
    result = await walkChain<T>(chain, tier, messages, opts);
  }

  if (opts.usage) {
    try {
      await logAiUsage(opts.usage.svc, opts.usage.userId, opts.usage.kind, result.tokens_in, result.tokens_out);
    } catch {
      // Usage logging is best-effort; don't fail the call if the RPC errors.
    }
  }
  return result;
}

async function walkChain<T>(
  chain: ReturnType<typeof planFreeChain>,
  tier: ChatFreeTier,
  messages: FreeChatMessage[],
  opts: ChatFreeOptions,
): Promise<ChatFreeResult<T>> {
  // Hop 1: every openai-compatible free provider, in order.
  try {
    const r = await callOpenAiCompatibleChain(chain, messages, {
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      parseJson: opts.parseJson,
    });
    let text: unknown = r.content;
    if (opts.parseJson) {
      const cleaned = stripJsonFences(r.content);
      try {
        text = JSON.parse(cleaned);
      } catch {
        throw new Error(`${r.provider} returned non-JSON: ${cleaned.slice(0, 200)}`);
      }
    }
    return {
      text: text as T,
      tokens_in: r.tokens_in,
      tokens_out: r.tokens_out,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      model: r.model,
      provider: r.provider,
      stop_reason: r.stop_reason,
    };
  } catch (freeError) {
    // Hop 2: legacy paid entries (if present in the chain), in chain order.
    const legacy = chain.filter((s) => s.kind !== "openai-compatible");
    if (legacy.length === 0) throw freeError;
    console.warn(`[chatFree] all free providers failed; degrading to paid fallback (${legacy.map((s) => s.id).join(", ")})`);
    let lastError: unknown = freeError;
    for (const spec of legacy) {
      try {
        const r = await callLlm<T>({
          ...messagesToLegacy(tier, messages, opts),
          provider: spec.id === "openai" ? "openai" : "anthropic",
        });
        return r as ChatFreeResult<T>;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
