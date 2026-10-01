/**
 * Ratchet: hard-coded LLM model IDs in edge functions may only go DOWN.
 *
 * Concrete model IDs belong in supabase/functions/_shared/models.ts, resolved
 * by logical tier (fast / balanced / deep / search) and overridable via env.
 * This test counts string literals that look like a model ID anywhere else
 * under supabase/functions and fails when the count exceeds BASELINE.
 *
 * When you migrate call sites to the registry, LOWER the baseline to the new
 * count (the test also fails if the baseline is stale, so the ratchet tightens).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Recorded 2026-10-01 after wiring _shared/llm.ts + _shared/ai.ts to the registry.
const BASELINE = 52;

const ROOT = path.resolve(__dirname, "../../supabase/functions");
const REGISTRY = path.join(ROOT, "_shared", "models.ts");

// A whole string literal that is (optionally "vendor/"-prefixed) model ID.
const MODEL_ID_RE =
  /^(?:[a-z0-9-]+\/)?(?:gpt-\d[\w.-]*|o[134](?:-mini|-pro)?|chatgpt-[\w.-]+|claude-(?:\d|opus|sonnet|haiku|instant)[\w.:-]*|gemini-[\w.-]+|sonar(?:-[\w-]+)?|(?:meta-)?llama-?\d[\w.:-]*|llama\d[\w.:-]*|mixtral-[\w.-]+|mistral-[\w.-]+|text-embedding-[\w-]+|dall-e-\d|whisper-\d)$/i;

const STRING_LITERAL_RE = /(["'`])([^"'`\n\\$]{2,100})\1/g;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
    return e.name.endsWith(".ts") ? [p] : [];
  });
}

function scan(): { total: number; byFile: Record<string, string[]> } {
  const byFile: Record<string, string[]> = {};
  let total = 0;
  for (const file of walk(ROOT)) {
    if (file === REGISTRY) continue;
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(STRING_LITERAL_RE)) {
      if (!MODEL_ID_RE.test(m[2])) continue;
      total++;
      (byFile[path.relative(ROOT, file)] ??= []).push(m[2]);
    }
  }
  return { total, byFile };
}

describe("model-id literal ratchet", () => {
  it("recognizes model ids and ignores ordinary strings", () => {
    for (const id of ["gpt-4o", "gpt-5.4-nano", "claude-sonnet-4-20250514", "claude-3-5-haiku-20241022", "google/gemini-2.5-pro", "sonar-pro", "o3-mini", "meta-llama/llama-3.3-70b-instruct:free"]) {
      expect(MODEL_ID_RE.test(id), id).toBe(true);
    }
    for (const s of ["claude-code", "content-type", "gpt", "sonarqube report", "gemini"]) {
      expect(MODEL_ID_RE.test(s), s).toBe(false);
    }
  });

  it(`hard-coded model ids outside _shared/models.ts do not exceed ${BASELINE}`, () => {
    const { total, byFile } = scan();
    const detail = Object.entries(byFile)
      .map(([f, ids]) => `  ${f}: ${ids.length} (${[...new Set(ids)].join(", ")})`)
      .join("\n");
    expect(
      total,
      `Found ${total} hard-coded model ids (baseline ${BASELINE}). Use resolveModel() from _shared/models.ts instead:\n${detail}`,
    ).toBeLessThanOrEqual(BASELINE);
    expect(
      total,
      `Model-id literals dropped to ${total}. Lower BASELINE in src/test/model-literals.test.ts to ${total} to lock in the win.`,
    ).toBe(BASELINE);
  });
});
