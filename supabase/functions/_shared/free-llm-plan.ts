/**
 * free-llm-plan — PURE provider-chain planning for the free LLM router.
 *
 * No Deno / node / fetch APIs here: given an env lookup function and a
 * workload tier, produce the ordered list of providers to try. Kept separate
 * from free-llm.ts so the routing policy is unit-testable in plain node
 * (vitest) without a Deno runtime.
 *
 * Provider chain (default, overridable via FREE_LLM_ORDER):
 *   gemini     Google AI Studio free tier (the one required key)
 *   groq       Groq free tier
 *   openrouter OpenRouter ":free" models
 *   ollama     self-hosted (present only when OLLAMA_BASE_URL is set —
 *              edge functions cannot reach localhost)
 *   openai     OPTIONAL paid fallback (existing router logic)
 *   anthropic  OPTIONAL paid fallback (existing router logic)
 */

export type FreeTier = "lite" | "standard";

export type FreeProviderId =
  | "gemini"
  | "groq"
  | "openrouter"
  | "ollama"
  | "openai"
  | "anthropic";

/** OpenAI-compatible providers handled directly by free-llm.ts. */
export type OpenAiCompatibleId = "gemini" | "groq" | "openrouter" | "ollama";

export interface ProviderSpec {
  id: FreeProviderId;
  /** openai-compatible → free-llm.ts fetch path; openai/anthropic → legacy clients. */
  kind: "openai-compatible" | "legacy-openai" | "legacy-anthropic";
  /** Full chat-completions URL (openai-compatible providers only). */
  url?: string;
  /** API key (openai-compatible providers except ollama). */
  apiKey?: string;
  /** Resolved model for the requested tier. */
  model: string;
}

export const DEFAULT_FREE_LLM_ORDER: readonly FreeProviderId[] = [
  "gemini",
  "groq",
  "openrouter",
  "ollama",
  "openai",
  "anthropic",
];

const KNOWN_PROVIDERS = new Set<string>(DEFAULT_FREE_LLM_ORDER);

export type EnvLookup = (key: string) => string | undefined;

function envOr(env: EnvLookup, key: string, fallback: string): string {
  const v = env(key);
  return v && v.trim() !== "" ? v.trim() : fallback;
}

/**
 * Parse FREE_LLM_ORDER. Unknown entries are ignored; duplicates dropped.
 * Falls back to the default order when unset or when nothing valid remains.
 */
export function parseFreeOrder(raw: string | undefined): FreeProviderId[] {
  if (!raw || raw.trim() === "") return [...DEFAULT_FREE_LLM_ORDER];
  const seen = new Set<string>();
  const out: FreeProviderId[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    if (KNOWN_PROVIDERS.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id as FreeProviderId);
    }
  }
  return out.length > 0 ? out : [...DEFAULT_FREE_LLM_ORDER];
}

function geminiSpec(env: EnvLookup, tier: FreeTier): ProviderSpec | null {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) return null;
  return {
    id: "gemini",
    kind: "openai-compatible",
    url: envOr(env, "GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"),
    apiKey,
    model: tier === "lite"
      ? envOr(env, "GEMINI_MODEL_LITE", "gemini-2.5-flash-lite")
      : envOr(env, "GEMINI_MODEL", "gemini-2.5-flash"),
  };
}

function groqSpec(env: EnvLookup, tier: FreeTier): ProviderSpec | null {
  const apiKey = env("GROQ_API_KEY");
  if (!apiKey) return null;
  return {
    id: "groq",
    kind: "openai-compatible",
    url: envOr(env, "GROQ_BASE_URL", "https://api.groq.com/openai/v1/chat/completions"),
    apiKey,
    model: tier === "lite"
      ? envOr(env, "GROQ_MODEL_LITE", "llama-3.1-8b-instant")
      : envOr(env, "GROQ_MODEL", "llama-3.3-70b-versatile"),
  };
}

function openrouterSpec(env: EnvLookup, tier: FreeTier): ProviderSpec | null {
  const apiKey = env("OPENROUTER_API_KEY");
  if (!apiKey) return null;
  return {
    id: "openrouter",
    kind: "openai-compatible",
    url: envOr(env, "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1/chat/completions"),
    apiKey,
    model: tier === "lite"
      ? envOr(env, "OPENROUTER_MODEL_LITE", "meta-llama/llama-3.3-70b-instruct:free")
      : envOr(env, "OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free"),
  };
}

function ollamaSpec(env: EnvLookup, tier: FreeTier): ProviderSpec | null {
  // Present ONLY when explicitly configured — an edge function cannot reach
  // localhost, so we never default to a local URL.
  const base = env("OLLAMA_BASE_URL");
  if (!base || base.trim() === "") return null;
  const trimmed = base.trim().replace(/\/+$/, "");
  return {
    id: "ollama",
    kind: "openai-compatible",
    url: /\/chat\/completions$/.test(trimmed) ? trimmed : `${trimmed}/v1/chat/completions`,
    model: tier === "lite"
      ? envOr(env, "OLLAMA_MODEL_LITE", "llama3.1:8b")
      : envOr(env, "OLLAMA_MODEL", "llama3.1:8b"),
  };
}

/**
 * Build the ordered provider chain for a tier, keeping only providers that
 * are "present" (have their key / base URL). Legacy openai/anthropic entries
 * are markers — llm.ts executes them through the pre-existing paid clients so
 * behavior there stays byte-for-byte identical.
 */
export function planFreeChain(env: EnvLookup, tier: FreeTier, orderRaw?: string): ProviderSpec[] {
  const order = parseFreeOrder(orderRaw ?? env("FREE_LLM_ORDER"));
  const specs: ProviderSpec[] = [];
  for (const id of order) {
    let spec: ProviderSpec | null = null;
    switch (id) {
      case "gemini": spec = geminiSpec(env, tier); break;
      case "groq": spec = groqSpec(env, tier); break;
      case "openrouter": spec = openrouterSpec(env, tier); break;
      case "ollama": spec = ollamaSpec(env, tier); break;
      case "openai":
        if (env("OPENAI_API_KEY")) spec = { id: "openai", kind: "legacy-openai", model: "" };
        break;
      case "anthropic":
        if (env("ANTHROPIC_API_KEY")) spec = { id: "anthropic", kind: "legacy-anthropic", model: "" };
        break;
    }
    if (spec) specs.push(spec);
  }
  return specs;
}

/** True when at least one genuinely-free provider (not legacy paid) is configured. */
export function hasFreeProvider(specs: ProviderSpec[]): boolean {
  return specs.some((s) => s.kind === "openai-compatible");
}
