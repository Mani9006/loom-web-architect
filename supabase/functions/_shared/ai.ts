/**
 * Shared AI client with tiered model routing + prompt caching.
 *
 * Policy (set by product; concrete IDs live in _shared/models.ts):
 *   - Simple tasks       → registry tier "fast"     (Haiku 4.5 default)
 *   - Complex / research → registry "balanced"/"deep" (Sonnet 4.6 default)
 *   - Opus 4.7 is reserved for auto-apply form-filling only and MUST be
 *     opted into explicitly via `model: "opus-4-7-auto-apply"`.
 *
 * Every call supports prompt caching on the system block + any declared
 * cacheable user blocks. Caller is responsible for ordering the cacheable
 * content first.
 *
 * Usage:
 *
 *   const { text, tokens_in, tokens_out } = await callClaude({
 *     tier: "simple",
 *     system: "You are a concise email editor.",
 *     cachedContext: resumeMarkdown,   // cached across calls for this user
 *     user: `Tighten this bullet: ${bullet}`,
 *     maxTokens: 400,
 *   });
 */

import { resolveModel, resolvePinnedModel } from "./models.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export type Tier = "simple" | "complex" | "research" | "opus-4-7-auto-apply";

/**
 * Resolve the concrete Claude model for a tier via the model registry
 * (_shared/models.ts). Defaults are unchanged: simple → Haiku 4.5,
 * complex/research → Sonnet 4.6, auto-apply → Opus 4.7. Override with
 * MODEL_FAST_ANTHROPIC / MODEL_BALANCED_ANTHROPIC / MODEL_DEEP_ANTHROPIC /
 * MODEL_AUTO_APPLY.
 */
export function modelFor(tier: Tier): string {
  const env = (k: string) => Deno.env.get(k);
  switch (tier) {
    case "simple":   return resolveModel("fast", env, { provider: "anthropic" }).model;
    case "complex":  return resolveModel("balanced", env, { provider: "anthropic" }).model;
    case "research": return resolveModel("deep", env, { provider: "anthropic" }).model;
    case "opus-4-7-auto-apply": return resolvePinnedModel("autoApply", env).model;
  }
}

export interface CallOptions {
  tier: Tier;
  /** System prompt — always cached. */
  system: string;
  /**
   * Long, slow-changing context (resume, job description). Cached across
   * calls for the same user. Optional.
   */
  cachedContext?: string;
  /** The varying user instruction for this specific call. */
  user: string;
  /** Max tokens. Defaults scale with tier: haiku 800, sonnet 2000, opus 2500. */
  maxTokens?: number;
  /** 0–1. Defaults to 0.2 for deterministic outputs. */
  temperature?: number;
  /** If set, response is parsed as JSON. Throws on bad JSON. */
  parseJson?: boolean;
}

export interface CallResult<T = string> {
  text: T;
  tokens_in: number;
  tokens_out: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  model: string;
  stop_reason: string;
}

const DEFAULT_MAX: Record<Tier, number> = {
  simple: 800,
  complex: 2000,
  research: 2500,
  "opus-4-7-auto-apply": 2500,
};

export async function callClaude<T = string>(opts: CallOptions): Promise<CallResult<T>> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const model = modelFor(opts.tier);
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX[opts.tier];
  const temperature = opts.temperature ?? 0.2;

  const system: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [
    { type: "text", text: opts.system, cache_control: { type: "ephemeral" } },
  ];
  if (opts.cachedContext) {
    system.push({
      type: "text",
      text: opts.cachedContext,
      cache_control: { type: "ephemeral" },
    });
  }

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: "user", content: opts.user }],
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`anthropic ${res.status}: ${err.slice(0, 500)}`);
  }

  const data = await res.json();
  const rawText = data.content?.[0]?.text ?? "";
  const usage = data.usage ?? {};
  const tokens_in = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  const tokens_out = usage.output_tokens ?? 0;

  let text: unknown = rawText;
  if (opts.parseJson) {
    const cleaned = rawText.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      text = JSON.parse(cleaned);
    } catch {
      throw new Error(`model returned non-JSON: ${cleaned.slice(0, 200)}`);
    }
  }

  return {
    text: text as T,
    tokens_in,
    tokens_out,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
    model,
    stop_reason: data.stop_reason ?? "end_turn",
  };
}

/**
 * Utility — truncate a potentially long string for inclusion in a prompt.
 * Prefer using cachedContext for >1KB content since caching is cheaper.
 */
export function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
