import { describe, expect, it } from "vitest";
import { computePipelineStats } from "@/lib/mc-pipeline-stats";

describe("computePipelineStats", () => {
  it("handles an empty board", () => {
    const s = computePipelineStats([]);
    expect(s).toMatchObject({ total: 0, applied: 0, interviews: 0, responseRate: null });
  });

  it("counts cards that advanced past Applied as applied", () => {
    const s = computePipelineStats([
      { status: "discovered" },
      { status: "saved" },
      { status: "applied", applied_at: "2026-01-01" },
      { status: "interview", applied_at: "2026-01-02" },
      { status: "offer" },
      { status: "rejected", applied_at: "2026-01-03" },
      { status: "rejected" },
    ]);
    expect(s.total).toBe(7);
    expect(s.saved).toBe(1);
    expect(s.applied).toBe(4);
    expect(s.interviews).toBe(2);
    expect(s.offers).toBe(1);
    expect(s.rejected).toBe(2);
    expect(s.active).toBe(2);
    expect(s.responseRate).toBe(50);
  });

  it("never reports a response rate above 100%", () => {
    const s = computePipelineStats([{ status: "interview" }, { status: "offer" }]);
    expect(s.applied).toBe(2);
    expect(s.responseRate).toBe(100);
  });
});
