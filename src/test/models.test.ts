import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODELS,
  DEFAULT_TIER_PROVIDER,
  inferProvider,
  MODEL_TIERS,
  parseModelSpec,
  resolveModel,
  resolvePinnedModel,
} from "../../supabase/functions/_shared/models";

type Env = Record<string, string | undefined>;
const lookup = (env: Env) => (key: string) => env[key];

describe("parseModelSpec / inferProvider", () => {
  it("parses provider:model", () => {
    expect(parseModelSpec("anthropic:claude-sonnet-5-5")).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5" });
    expect(parseModelSpec(" OpenAI : gpt-5.4-mini ")).toEqual({ provider: "openai", model: "gpt-5.4-mini" });
  });

  it("infers provider from a bare model id", () => {
    expect(parseModelSpec("claude-opus-5-5")).toEqual({ provider: "anthropic", model: "claude-opus-5-5" });
    expect(inferProvider("gpt-5.4-nano")).toBe("openai");
    expect(inferProvider("o3-mini")).toBe("openai");
    expect(inferProvider("gemini-2.5-flash")).toBe("gemini");
    expect(inferProvider("sonar-pro")).toBe("perplexity");
  });

  it("rejects empty, unknown-provider and un-inferable values", () => {
    expect(parseModelSpec(undefined)).toBeNull();
    expect(parseModelSpec("  ")).toBeNull();
    expect(parseModelSpec("anthropic:")).toBeNull();
    expect(parseModelSpec("llama3.1:8b")).toBeNull();
    expect(parseModelSpec("mystery-model")).toBeNull();
  });
});

describe("resolveModel — defaults (env unset)", () => {
  it("preserves pre-registry production defaults", () => {
    const env = lookup({});
    // llm.ts OpenAI path
    expect(resolveModel("fast", env, { provider: "openai" }).model).toBe("gpt-5.4-nano");
    expect(resolveModel("balanced", env, { provider: "openai" }).model).toBe("gpt-5.4-mini");
    expect(resolveModel("deep", env, { provider: "openai" }).model).toBe("gpt-5.4-mini");
    // ai.ts Anthropic path
    expect(resolveModel("fast", env, { provider: "anthropic" }).model).toBe("claude-haiku-4-5-20251001");
    expect(resolveModel("balanced", env, { provider: "anthropic" }).model).toBe("claude-sonnet-4-6");
    expect(resolveModel("deep", env, { provider: "anthropic" }).model).toBe("claude-sonnet-4-6");
  });

  it("uses the default provider for each tier when none is given", () => {
    for (const tier of MODEL_TIERS) {
      const r = resolveModel(tier, lookup({}));
      expect(r.provider).toBe(DEFAULT_TIER_PROVIDER[tier]);
      expect(r.model).toBe(DEFAULT_MODELS[r.provider][tier]);
      expect(r.source).toBe("default");
    }
  });

  it("every tier's default provider actually has a default model", () => {
    for (const tier of MODEL_TIERS) {
      expect(DEFAULT_MODELS[DEFAULT_TIER_PROVIDER[tier]][tier]).toBeTruthy();
    }
  });

  it("throws a helpful error when a provider has no model for a tier", () => {
    expect(() => resolveModel("search", lookup({}), { provider: "anthropic" })).toThrow(/MODEL_SEARCH_ANTHROPIC/);
  });
});

describe("resolveModel — env precedence", () => {
  it("MODEL_<TIER> picks provider and model when no provider is forced", () => {
    const r = resolveModel("balanced", lookup({ MODEL_BALANCED: "anthropic:claude-sonnet-5-5" }));
    expect(r).toEqual({ tier: "balanced", provider: "anthropic", model: "claude-sonnet-5-5", source: "MODEL_BALANCED" });
  });

  it("ignores MODEL_<TIER> when its provider differs from the forced provider", () => {
    const r = resolveModel("balanced", lookup({ MODEL_BALANCED: "claude-sonnet-5-5" }), { provider: "openai" });
    expect(r.model).toBe("gpt-5.4-mini");
    expect(r.source).toBe("default");
  });

  it("applies MODEL_<TIER> when its provider matches", () => {
    const r = resolveModel("deep", lookup({ MODEL_DEEP: "claude-opus-5-5" }), { provider: "anthropic" });
    expect(r.model).toBe("claude-opus-5-5");
  });

  it("MODEL_<TIER>_<PROVIDER> beats legacy keys, which beat MODEL_<TIER>", () => {
    const env = {
      MODEL_FAST: "openai:gpt-tier",
      OPENAI_MODEL_CHEAP: "gpt-legacy",
      MODEL_FAST_OPENAI: "openai:gpt-specific",
    };
    const opts = { provider: "openai" as const, legacyEnvKeys: ["OPENAI_MODEL_CHEAP"] };
    expect(resolveModel("fast", lookup(env), opts)).toMatchObject({ model: "gpt-specific", source: "MODEL_FAST_OPENAI" });
    const { MODEL_FAST_OPENAI: _drop, ...noSpecific } = env;
    expect(resolveModel("fast", lookup(noSpecific), opts)).toMatchObject({ model: "gpt-legacy", source: "OPENAI_MODEL_CHEAP" });
    expect(resolveModel("fast", lookup({ MODEL_FAST: "gpt-tier" }), opts)).toMatchObject({ model: "gpt-tier", source: "MODEL_FAST" });
  });

  it("treats blank env values as unset", () => {
    const r = resolveModel("fast", lookup({ MODEL_FAST_OPENAI: "  ", OPENAI_MODEL_CHEAP: "" }), {
      provider: "openai",
      legacyEnvKeys: ["OPENAI_MODEL_CHEAP"],
    });
    expect(r.model).toBe("gpt-5.4-nano");
  });
});

describe("resolvePinnedModel", () => {
  it("defaults the auto-apply route to Opus 4.7", () => {
    expect(resolvePinnedModel("autoApply", lookup({}))).toMatchObject({ provider: "anthropic", model: "claude-opus-4-7" });
  });

  it("honors MODEL_AUTO_APPLY and refuses a cross-provider override", () => {
    expect(resolvePinnedModel("autoApply", lookup({ MODEL_AUTO_APPLY: "claude-opus-5-5" })).model).toBe("claude-opus-5-5");
    expect(() => resolvePinnedModel("autoApply", lookup({ MODEL_AUTO_APPLY: "gpt-5.4-mini" }))).toThrow(/anthropic/);
  });
});
