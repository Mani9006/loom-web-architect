import { describe, it, expect } from "vitest";
import { computeFunnel } from "@/lib/mc-stats";

describe("computeFunnel", () => {
  it("counts jobs that progressed past applied as applied", () => {
    const f = computeFunnel(["discovered", "saved", "applied", "interview", "take_home", "offer", "rejected"]);
    expect(f).toEqual({ total: 7, applied: 4, interviews: 2, offers: 1 });
  });
  it("handles empty input", () => {
    expect(computeFunnel([])).toEqual({ total: 0, applied: 0, interviews: 0, offers: 0 });
  });
});
