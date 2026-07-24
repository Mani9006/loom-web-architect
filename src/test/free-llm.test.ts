import { describe, expect, it } from "vitest";
import {
  DEFAULT_FREE_LLM_ORDER,
  hasFreeProvider,
  parseFreeOrder,
  planFreeChain,
} from "../../supabase/functions/_shared/free-llm-plan";

type Env = Record<string, string | undefined>;
const lookup = (env: Env) => (key: string) => env[key];

describe("parseFreeOrder", () => {
  it("returns the default order when unset or empty", () => {
    expect(parseFreeOrder(undefined)).toEqual([...DEFAULT_FREE_LLM_ORDER]);
    expect(parseFreeOrder("")).toEqual([...DEFAULT_FREE_LLM_ORDER]);
    expect(parseFreeOrder("   ")).toEqual([...DEFAULT_FREE_LLM_ORDER]);
  });

  it("parses a custom order, trimming and lowercasing", () => {
    expect(parseFreeOrder(" Groq , GEMINI ")).toEqual(["groq", "gemini"]);
  });

  it("drops unknown providers and duplicates", () => {
    expect(parseFreeOrder("gemini,banana,gemini,groq")).toEqual(["gemini", "groq"]);
  });

  it("falls back to default when nothing valid remains", () => {
    expect(parseFreeOrder("banana,orange")).toEqual([...DEFAULT_FREE_LLM_ORDER]);
  });
});

describe("planFreeChain — provider presence", () => {
  it("returns an empty chain when no keys are configured", () => {
    expect(planFreeChain(lookup({}), "standard")).toEqual([]);
  });

  it("includes only providers whose keys are present", () => {
    const chain = planFreeChain(lookup({ GEMINI_API_KEY: "g", OPENROUTER_API_KEY: "o" }), "standard");
    expect(chain.map((s) => s.id)).toEqual(["gemini", "openrouter"]);
  });

  it("treats ollama as present only when OLLAMA_BASE_URL is set", () => {
    expect(planFreeChain(lookup({}), "standard").some((s) => s.id === "ollama")).toBe(false);
    const chain = planFreeChain(lookup({ OLLAMA_BASE_URL: "http://host.docker.internal:11434" }), "standard");
    const ollama = chain.find((s) => s.id === "ollama");
    expect(ollama).toBeDefined();
    expect(ollama?.url).toBe("http://host.docker.internal:11434/v1/chat/completions");
    expect(ollama?.apiKey).toBeUndefined();
  });

  it("keeps a full /chat/completions ollama URL as-is", () => {
    const chain = planFreeChain(
      lookup({ OLLAMA_BASE_URL: "http://example:11434/v1/chat/completions" }),
      "standard",
    );
    expect(chain.find((s) => s.id === "ollama")?.url).toBe("http://example:11434/v1/chat/completions");
  });

  it("marks openai/anthropic as legacy hops when their keys exist", () => {
    const chain = planFreeChain(lookup({ OPENAI_API_KEY: "sk", ANTHROPIC_API_KEY: "ak" }), "standard");
    expect(chain.map((s) => [s.id, s.kind])).toEqual([
      ["openai", "legacy-openai"],
      ["anthropic", "legacy-anthropic"],
    ]);
    expect(hasFreeProvider(chain)).toBe(false);
  });
});

describe("planFreeChain — tier models", () => {
  it("uses lite models for the lite tier", () => {
    const chain = planFreeChain(lookup({ GEMINI_API_KEY: "g", GROQ_API_KEY: "q" }), "lite");
    expect(chain.find((s) => s.id === "gemini")?.model).toBe("gemini-2.5-flash-lite");
    expect(chain.find((s) => s.id === "groq")?.model).toBe("llama-3.1-8b-instant");
  });

  it("uses standard models for the standard tier", () => {
    const chain = planFreeChain(
      lookup({ GEMINI_API_KEY: "g", GROQ_API_KEY: "q", OPENROUTER_API_KEY: "o" }),
      "standard",
    );
    expect(chain.find((s) => s.id === "gemini")?.model).toBe("gemini-2.5-flash");
    expect(chain.find((s) => s.id === "groq")?.model).toBe("llama-3.3-70b-versatile");
    expect(chain.find((s) => s.id === "openrouter")?.model).toBe("meta-llama/llama-3.3-70b-instruct:free");
  });

  it("honors model env overrides", () => {
    const chain = planFreeChain(
      lookup({ GEMINI_API_KEY: "g", GEMINI_MODEL: "gemini-3-pro", GEMINI_MODEL_LITE: "gemini-3-nano" }),
      "standard",
    );
    expect(chain[0].model).toBe("gemini-3-pro");
    const lite = planFreeChain(
      lookup({ GEMINI_API_KEY: "g", GEMINI_MODEL: "gemini-3-pro", GEMINI_MODEL_LITE: "gemini-3-nano" }),
      "lite",
    );
    expect(lite[0].model).toBe("gemini-3-nano");
  });
});

describe("planFreeChain — ordering", () => {
  it("orders by FREE_LLM_ORDER and filters by presence", () => {
    const env = lookup({
      FREE_LLM_ORDER: "groq,gemini,openai",
      GEMINI_API_KEY: "g",
      GROQ_API_KEY: "q",
      OPENAI_API_KEY: "sk",
    });
    expect(planFreeChain(env, "standard").map((s) => s.id)).toEqual(["groq", "gemini", "openai"]);
  });

  it("explicit FREE_LLM_ORDER read from env beats the passed default list", () => {
    const env = lookup({ FREE_LLM_ORDER: "openrouter", OPENROUTER_API_KEY: "o", GEMINI_API_KEY: "g" });
    expect(planFreeChain(env, "standard").map((s) => s.id)).toEqual(["openrouter"]);
  });

  it("default order puts gemini first and paid providers last", () => {
    const env = lookup({
      GEMINI_API_KEY: "g",
      GROQ_API_KEY: "q",
      OPENROUTER_API_KEY: "o",
      OLLAMA_BASE_URL: "http://x:11434",
      OPENAI_API_KEY: "sk",
      ANTHROPIC_API_KEY: "ak",
    });
    expect(planFreeChain(env, "standard").map((s) => s.id)).toEqual([
      "gemini",
      "groq",
      "openrouter",
      "ollama",
      "openai",
      "anthropic",
    ]);
  });
});

describe("hasFreeProvider", () => {
  it("is false for empty or legacy-only chains", () => {
    expect(hasFreeProvider([])).toBe(false);
    expect(hasFreeProvider(planFreeChain(lookup({ OPENAI_API_KEY: "sk" }), "standard"))).toBe(false);
  });

  it("is true when any openai-compatible provider is present", () => {
    expect(hasFreeProvider(planFreeChain(lookup({ GEMINI_API_KEY: "g" }), "standard"))).toBe(true);
    expect(hasFreeProvider(planFreeChain(lookup({ OLLAMA_BASE_URL: "http://x" }), "standard"))).toBe(true);
  });
});
