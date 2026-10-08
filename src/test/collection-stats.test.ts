import { describe, expect, it } from "vitest";
import { computePipelineStats } from "@/lib/collection-stats";

describe("computePipelineStats", () => {
  it("counts applied cumulatively so the response rate never exceeds 100%", () => {
    const s = computePipelineStats(["saved", "interview", "interview", "offer"]);
    expect(s.applied).toBe(3);
    expect(s.interviews).toBe(3);
    expect(s.responseRate).toBe(100);
  });

  it("returns null response rate with no applications", () => {
    expect(computePipelineStats(["saved"]).responseRate).toBeNull();
  });

  it("treats take_home as an interview stage", () => {
    const s = computePipelineStats(["applied", "take_home", "rejected"]);
    expect(s).toMatchObject({ total: 3, applied: 3, interviews: 1, rejected: 1, responseRate: 33 });
  });
});
