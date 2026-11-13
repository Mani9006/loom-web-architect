import { describe, expect, it } from "vitest";
import { computePipelineCounts, hasApplied, statusChangeUpdates } from "@/lib/mc-pipeline";

describe("mc-pipeline", () => {
  it("counts jobs that moved past Applied as applications", () => {
    const counts = computePipelineCounts([
      { status: "discovered" },
      { status: "saved" },
      { status: "applied" },
      { status: "interview" },
      { status: "offer" },
      { status: "rejected", applied_at: "2026-11-01T00:00:00Z" },
      { status: "rejected" },
    ]);
    expect(counts.total).toBe(7);
    expect(counts.saved).toBe(1);
    expect(counts.applied).toBe(4);
    expect(counts.interviews).toBe(2);
    expect(counts.offers).toBe(1);
    expect(counts.rejected).toBe(2);
    expect(counts.responseRate).toBe(50);
  });

  it("never reports a response rate above 100%", () => {
    const counts = computePipelineCounts([{ status: "interview" }, { status: "take_home" }, { status: "offer" }]);
    expect(counts.responseRate).toBe(100);
  });

  it("returns null response rate when nothing was applied", () => {
    expect(computePipelineCounts([{ status: "saved" }]).responseRate).toBeNull();
  });

  it("treats applied_at as proof of application", () => {
    expect(hasApplied({ status: "withdrawn", applied_at: "2026-01-01" })).toBe(true);
    expect(hasApplied({ status: "withdrawn" })).toBe(false);
  });

  it("stamps applied_at when skipping straight to a post-apply stage", () => {
    const now = new Date("2026-11-13T00:00:00Z");
    expect(statusChangeUpdates({ status: "saved" }, "interview", now)).toEqual({
      status: "interview",
      applied_at: now.toISOString(),
    });
    expect(statusChangeUpdates({ status: "applied", applied_at: "x" }, "offer", now)).toEqual({ status: "offer" });
    expect(statusChangeUpdates({ status: "saved" }, "hold", now)).toEqual({ status: "hold" });
  });
});
