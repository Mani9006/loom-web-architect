import { describe, expect, it } from "vitest";
import { computePipelineStats, hasApplied, jobIdentityKey } from "@/lib/mc-stats";

describe("computePipelineStats", () => {
  it("counts jobs that progressed past applied as applied", () => {
    const stats = computePipelineStats([
      { status: "saved" },
      { status: "applied" },
      { status: "interview" },
      { status: "offer" },
      { status: "rejected", applied_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(stats.total).toBe(5);
    expect(stats.applied).toBe(4);
    expect(stats.interviews).toBe(1);
    expect(stats.offers).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.responseRate).toBe(50);
  });

  it("never reports a response rate over 100%", () => {
    const stats = computePipelineStats([
      { status: "interview" },
      { status: "take_home" },
      { status: "offer" },
    ]);
    expect(stats.applied).toBe(3);
    expect(stats.responseRate).toBe(100);
  });

  it("returns null response rate with no applications", () => {
    const stats = computePipelineStats([{ status: "saved" }, { status: "discovered" }]);
    expect(stats.applied).toBe(0);
    expect(stats.responseRate).toBeNull();
  });

  it("does not count rejected-before-applying as applied", () => {
    expect(hasApplied({ status: "rejected" })).toBe(false);
    expect(hasApplied({ status: "withdrawn", applied_at: "2026-01-01" })).toBe(true);
  });
});

describe("jobIdentityKey", () => {
  it("normalizes case and whitespace", () => {
    expect(jobIdentityKey("  Acme  Corp", "Senior   Engineer ")).toBe(jobIdentityKey("acme corp", "senior engineer"));
  });
  it("handles nulls", () => {
    expect(jobIdentityKey(null, undefined)).toBe("::");
  });
});
