import { describe, expect, it } from "vitest";
import { buildFullName } from "@/lib/full-name";

describe("buildFullName", () => {
  it("keeps multi-word first names intact", () => {
    expect(buildFullName("Mary Ann", "Smith")).toBe("Mary Ann Smith");
  });

  it("trims whitespace and drops empty parts", () => {
    expect(buildFullName(" Mary ", "")).toBe("Mary");
    expect(buildFullName("", " Smith ")).toBe("Smith");
    expect(buildFullName("  ", "  ")).toBe("");
  });
});
