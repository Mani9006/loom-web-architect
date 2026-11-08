import { describe, it, expect } from "vitest";
import { computeMcStats } from "@/lib/mc-stats";

const rows = (...s: string[]) => s.map((status) => ({ status }));

describe("computeMcStats", () => {
  it("counts later-stage jobs as applied", () => {
    const s = computeMcStats(rows("discovered", "saved", "applied", "interview", "offer", "rejected"));
    expect(s.total).toBe(6);
    expect(s.applied).toBe(4);
    expect(s.interviews).toBe(1);
    expect(s.offers).toBe(1);
  });
  it("never exceeds 100% response rate", () => {
    const s = computeMcStats(rows("interview", "offer"));
    expect(s.responseRate).toBe(100);
  });
  it("returns null rate with no applications", () => {
    expect(computeMcStats(rows("saved")).responseRate).toBeNull();
    expect(computeMcStats([]).total).toBe(0);
  });
});
