import { describe, expect, it } from "vitest";
import { safeFileName } from "@/lib/safe-file-name";

describe("safeFileName", () => {
  it("replaces path separators and reserved characters", () => {
    expect(safeFileName("Acme, ML/AI Engineer")).toBe("Acme, ML-AI Engineer");
    expect(safeFileName('a:b*c?"d<e>f|g\\h')).toBe("a-b-c-d-e-f-g-h");
  });

  it("collapses whitespace and trims dots/dashes", () => {
    expect(safeFileName("  ..My   Resume.. ")).toBe("My Resume");
  });

  it("falls back when nothing usable remains", () => {
    expect(safeFileName("///")).toBe("resume");
    expect(safeFileName("", "x")).toBe("x");
  });

  it("caps very long names", () => {
    expect(safeFileName("a".repeat(500)).length).toBe(120);
  });
});
