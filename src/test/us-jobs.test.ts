import { describe, expect, it } from "vitest";
import { isUsLocation, assertUsOnly } from "@/product/lib/us-jobs";

describe("isUsLocation", () => {
  it("accepts explicit US labels", () => {
    expect(isUsLocation("Remote - United States")).toBe(true);
    expect(isUsLocation("Austin, TX")).toBe(true);
    expect(isUsLocation("Remote US")).toBe(true);
    expect(isUsLocation(null, "US")).toBe(true);
  });

  it("rejects non-US locations", () => {
    expect(isUsLocation("London, UK")).toBe(false);
    expect(isUsLocation("Bengaluru, India")).toBe(false);
    expect(isUsLocation("Toronto, Canada")).toBe(false);
    expect(isUsLocation("Berlin", "DE")).toBe(false);
  });

  it("filters mixed feeds", () => {
    const rows = assertUsOnly([
      { location: "New York, NY" },
      { location: "London, United Kingdom" },
      { location: "Remote" },
    ]);
    expect(rows.map((r) => r.location)).toEqual(["New York, NY", "Remote"]);
  });
});
