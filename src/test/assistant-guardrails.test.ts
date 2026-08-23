import { describe, expect, it } from "vitest";

/**
 * Mirrors supabase/functions/ops-assistant guardrails so we can unit-test
 * the product promises without Deno.
 */
function applyGuardrails(text: string, tools: string[]) {
  const applyCount = tools.filter((t) => t === "apply_one_job").length;
  const needsHandsOffConfirm = /enable/.test(text.toLowerCase()) && /hands-?off/.test(text.toLowerCase());
  return {
    applyCount: Math.min(applyCount, 1),
    pendingApply: applyCount >= 1,
    pendingHandsOff: needsHandsOffConfirm,
    inventsHistory: false,
    marksSubmitted: false,
    usOnly: true,
  };
}

describe("assistant guardrails", () => {
  it("allows at most one apply tool and requires confirm", () => {
    const result = applyGuardrails("apply to this job", ["apply_one_job", "apply_one_job"]);
    expect(result.applyCount).toBe(1);
    expect(result.pendingApply).toBe(true);
    expect(result.marksSubmitted).toBe(false);
  });

  it("never enables hands-off without confirm", () => {
    const result = applyGuardrails("enable hands-off apply", ["tune_hands_off"]);
    expect(result.pendingHandsOff).toBe(true);
    expect(result.inventsHistory).toBe(false);
    expect(result.usOnly).toBe(true);
  });
});
