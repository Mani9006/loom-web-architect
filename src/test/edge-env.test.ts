import { describe, expect, it } from "vitest";
import { createEnv, EnvError } from "../../supabase/functions/_shared/env";

const make = (vars: Record<string, string | undefined>) => createEnv((k) => vars[k]);

describe("edge env helpers", () => {
  it("requireEnv returns trimmed values and throws EnvError when unset or blank", () => {
    const env = make({ A: "  x  ", BLANK: "   " });
    expect(env.requireEnv("A")).toBe("x");
    expect(() => env.requireEnv("MISSING")).toThrow(EnvError);
    expect(() => env.requireEnv("BLANK", "career-ops-scan")).toThrow(/BLANK.*career-ops-scan.*supabase secrets set BLANK=/);
  });

  it("optionalEnv returns undefined or the fallback", () => {
    const env = make({ A: "a", BLANK: "" });
    expect(env.optionalEnv("A")).toBe("a");
    expect(env.optionalEnv("NOPE")).toBeUndefined();
    expect(env.optionalEnv("BLANK", "fb")).toBe("fb");
  });

  it("requireEnvs reports every missing variable at once", () => {
    const env = make({ A: "1" });
    expect(env.requireEnvs(["A"])).toEqual({ A: "1" });
    try {
      env.requireEnvs(["A", "B", "C"]);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      expect((e as EnvError).missing).toEqual(["B", "C"]);
      expect((e as Error).message).toMatch(/variables: B, C/);
    }
  });

  it("boolEnv parses common truthy spellings", () => {
    const env = make({ T: "TRUE", Y: "yes", O: "1", F: "false", Z: "0" });
    expect(env.boolEnv("T")).toBe(true);
    expect(env.boolEnv("Y")).toBe(true);
    expect(env.boolEnv("O")).toBe(true);
    expect(env.boolEnv("F")).toBe(false);
    expect(env.boolEnv("Z", true)).toBe(false);
    expect(env.boolEnv("UNSET", true)).toBe(true);
  });
});
