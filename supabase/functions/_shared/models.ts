/**
 * models — the single place that knows concrete LLM model IDs.
 *
 * PURE module: no Deno / node / fetch APIs. Callers pass an env lookup
 * (`(k) => Deno.env.get(k)` in edge functions) so the routing policy is
 * unit-testable from vitest (src/test/models.test.ts).
 *
 * Code asks for a LOGICAL tier, never a model ID:
 *
 *   fast      routine extraction, classification, short rewrites
 *   balanced  resume tailoring, scoring, cover-letter drafts (the default)
 *   deep      reasoning-heavy, multi-step planning, research
 *   search    web-grounded answers (job search, company research)
 *
 * Resolution order for resolveModel(tier, env, { provider }):
 *
 *   1. MODEL_<TIER>_<PROVIDER>   e.g. MODEL_FAST_OPENAI=gpt-5.4-nano
 *   2. legacyEnvKeys             e.g. OPENAI_MODEL_CHEAP (pre-registry names)
 *   3. MODEL_<TIER>              e.g. MODEL_BALANCED=anthropic:claude-sonnet-5-5
 *                                (only when its provider matches)
 *   4. DEFAULT_MODELS[provider][tier]
 *
 * Without a provider, MODEL_<TIER> wins outright (and picks the provider),
 * otherwise DEFAULT_TIER_PROVIDER[tier] supplies it.
 *
 * MODEL_* values are "provider:model" or a bare model ID whose provider is
 * inferred from its prefix (gpt-/o1-/o3- → openai, claude- → anthropic,
 * gemini- → gemini, sonar → perplexity).
 *
 * The defaults below intentionally mirror what production ran before this
 * registry existed (OpenAI gpt-5.4-*, Claude Haiku 4.5 / Sonnet 4.6) so that
 * wiring it in changed no behavior. Upgrading is an env change, e.g.
 *   MODEL_BALANCED_ANTHROPIC=claude-sonnet-5-5
 *   MODEL_DEEP_ANTHROPIC=claude-opus-5-5
 * NOTE: claude-haiku-4-5-20251001 may retire no sooner than 2026-10-15 —
 * set MODEL_FAST_ANTHROPIC before then (strategy doc §5 suggests
 * claude-sonnet-5-5 at low effort).
 *
 * A vitest ratchet (src/test/model-literals.test.ts) fails if hard-coded
 * model IDs appear in supabase/functions outside this file beyond the
 * recorded baseline. Migrate call sites here; never add new literals.
 */

export type ModelTier = "fast" | "balanced" | "deep" | "search";
export type ModelProvider = "openai" | "anthropic" | "gemini" | "perplexity";

export const MODEL_TIERS: readonly ModelTier[] = ["fast", "balanced", "deep", "search"];
export const MODEL_PROVIDERS: readonly ModelProvider[] = ["openai", "anthropic", "gemini", "perplexity"];

export type EnvLookup = (key: string) => string | undefined;

/** Per-provider defaults. A missing entry means "provider has no model for this tier". */
export const DEFAULT_MODELS: Readonly<Record<ModelProvider, Readonly<Partial<Record<ModelTier, string>>>>> = {
  openai: {
    fast: "gpt-5.4-nano",
    balanced: "gpt-5.4-mini",
    deep: "gpt-5.4-mini",
  },
  anthropic: {
    fast: "claude-haiku-4-5-20251001",
    balanced: "claude-sonnet-4-6",
    deep: "claude-sonnet-4-6",
  },
  gemini: {
    fast: "gemini-2.5-flash-lite",
    balanced: "gemini-2.5-flash",
    deep: "gemini-2.5-pro",
  },
  perplexity: {
    fast: "sonar",
    search: "sonar-pro",
  },
};

/** Provider used when a caller asks for a tier without naming a provider. */
export const DEFAULT_TIER_PROVIDER: Readonly<Record<ModelTier, ModelProvider>> = {
  fast: "openai",
  balanced: "openai",
  deep: "openai",
  search: "perplexity",
};

/**
 * Explicit, opt-in routes that are deliberately NOT a tier (product policy:
 * Opus is reserved for auto-apply form filling). Overridable via envKey.
 */
export const PINNED_ROUTES = {
  autoApply: { provider: "anthropic", model: "claude-opus-4-7", envKey: "MODEL_AUTO_APPLY" },
} as const satisfies Record<string, { provider: ModelProvider; model: string; envKey: string }>;

export type PinnedRouteName = keyof typeof PINNED_ROUTES;

export interface ModelRoute {
  tier: ModelTier | PinnedRouteName;
  provider: ModelProvider;
  model: string;
  /** Env key that supplied the model, or "default". Useful for logging. */
  source: string;
}

export interface ModelSpec {
  provider: ModelProvider;
  model: string;
}

const PROVIDER_SET = new Set<string>(MODEL_PROVIDERS);

function read(env: EnvLookup, key: string): string | undefined {
  const v = env(key);
  return v && v.trim() !== "" ? v.trim() : undefined;
}

/** Infer a provider from a bare model ID. Returns null when unknown. */
export function inferProvider(model: string): ModelProvider | null {
  const m = model.toLowerCase();
  if (/^(gpt-|chatgpt-|o\d(-|$))/.test(m)) return "openai";
  if (m.startsWith("claude-")) return "anthropic";
  if (m.startsWith("gemini-")) return "gemini";
  if (m.startsWith("sonar")) return "perplexity";
  return null;
}

/**
 * Parse "provider:model" or a bare model ID. Returns null for empty input,
 * an unknown provider prefix, or a bare ID whose provider cannot be inferred.
 * (Model IDs themselves may contain ":" — e.g. "llama3.1:8b" — so only a
 * KNOWN provider before the first ":" is treated as a provider prefix.)
 */
export function parseModelSpec(raw: string | undefined): ModelSpec | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value === "") return null;
  const idx = value.indexOf(":");
  if (idx > 0) {
    const maybeProvider = value.slice(0, idx).trim().toLowerCase();
    if (PROVIDER_SET.has(maybeProvider)) {
      const model = value.slice(idx + 1).trim();
      return model ? { provider: maybeProvider as ModelProvider, model } : null;
    }
  }
  const provider = inferProvider(value);
  return provider ? { provider, model: value } : null;
}

export interface ResolveOptions {
  /** Force a provider (the caller's client only speaks this API). */
  provider?: ModelProvider;
  /** Pre-registry env names to honor, checked after MODEL_<TIER>_<PROVIDER>. */
  legacyEnvKeys?: readonly string[];
}

export function tierEnvKey(tier: ModelTier, provider?: ModelProvider): string {
  return provider ? `MODEL_${tier.toUpperCase()}_${provider.toUpperCase()}` : `MODEL_${tier.toUpperCase()}`;
}

/**
 * Resolve a logical tier to a concrete provider + model. Throws only when the
 * requested provider has no default for the tier and nothing is configured.
 */
export function resolveModel(tier: ModelTier, env: EnvLookup, opts: ResolveOptions = {}): ModelRoute {
  const { provider, legacyEnvKeys = [] } = opts;
  const tierKey = tierEnvKey(tier);
  const tierSpec = parseModelSpec(read(env, tierKey));

  if (!provider) {
    if (tierSpec) return { tier, ...tierSpec, source: tierKey };
    return resolveModel(tier, env, { provider: DEFAULT_TIER_PROVIDER[tier], legacyEnvKeys });
  }

  const providerKey = tierEnvKey(tier, provider);
  const providerValue = read(env, providerKey);
  if (providerValue) {
    // Provider is fixed by the key name; tolerate a redundant "provider:" prefix.
    const prefix = `${provider}:`;
    const model = providerValue.toLowerCase().startsWith(prefix)
      ? providerValue.slice(prefix.length).trim()
      : providerValue;
    return { tier, provider, model, source: providerKey };
  }

  for (const key of legacyEnvKeys) {
    const v = read(env, key);
    if (v) return { tier, provider, model: v, source: key };
  }

  if (tierSpec && tierSpec.provider === provider) {
    return { tier, provider, model: tierSpec.model, source: tierKey };
  }

  const fallback = DEFAULT_MODELS[provider][tier];
  if (!fallback) {
    throw new Error(
      `models: no ${provider} model for tier "${tier}". Set ${providerKey} or ${tierKey}=${provider}:<model>.`,
    );
  }
  return { tier, provider, model: fallback, source: "default" };
}

/** Resolve an explicit pinned route (see PINNED_ROUTES). */
export function resolvePinnedModel(name: PinnedRouteName, env: EnvLookup): ModelRoute {
  const route = PINNED_ROUTES[name];
  const override = read(env, route.envKey);
  if (override) {
    const spec = parseModelSpec(override);
    if (spec && spec.provider !== route.provider) {
      throw new Error(`models: ${route.envKey} must be a ${route.provider} model (got ${override}).`);
    }
    return { tier: name, provider: route.provider, model: spec?.model ?? override, source: route.envKey };
  }
  return { tier: name, provider: route.provider, model: route.model, source: "default" };
}
