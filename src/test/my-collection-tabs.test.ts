import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("My Collection page", () => {
  it("uses an en dash, not a comma, as the empty-stat placeholder", () => {
    const src = readFileSync("src/pages/MyCollection/MyCollectionPage.tsx", "utf8");
    expect(src).not.toMatch(/\?\? ","/);
    expect(src).toMatch(/\?\? "–"/);
  });
});
