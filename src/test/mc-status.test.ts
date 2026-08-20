import { describe, expect, it } from "vitest";
import { hasApplied, hasResponded, summarizeJobs } from "@/lib/mc-status";

describe("hasApplied", () => {
  it("counts a card that has moved past Applied", () => {
    expect(hasApplied({ status: "interview", applied_at: null })).toBe(true);
    expect(hasApplied({ status: "offer", applied_at: null })).toBe(true);
    expect(hasApplied({ status: "rejected", applied_at: null })).toBe(true);
  });

  it("counts a card stamped with applied_at even if it was moved back", () => {
    expect(hasApplied({ status: "hold", applied_at: "2026-01-01T00:00:00Z" })).toBe(true);
  });

  it("does not count cards that were never applied to", () => {
    expect(hasApplied({ status: "saved", applied_at: null })).toBe(false);
    expect(hasApplied({ status: "discovered", applied_at: null })).toBe(false);
    expect(hasApplied({ status: "hold", applied_at: null })).toBe(false);
  });
});

describe("hasResponded", () => {
  it("treats employer-driven statuses as a response", () => {
    expect(hasResponded({ status: "viewed" })).toBe(true);
    expect(hasResponded({ status: "interview" })).toBe(true);
    expect(hasResponded({ status: "take_home" })).toBe(true);
    expect(hasResponded({ status: "offer" })).toBe(true);
  });

  it("does not treat a rejection or a pending application as a response", () => {
    expect(hasResponded({ status: "applied" })).toBe(false);
    expect(hasResponded({ status: "rejected" })).toBe(false);
    expect(hasResponded({ status: "saved" })).toBe(false);
  });
});

describe("summarizeJobs", () => {
  it("keeps applications counted after they progress", () => {
    const totals = summarizeJobs([
      { status: "applied", applied_at: "2026-01-01T00:00:00Z" },
      { status: "interview", applied_at: "2026-01-02T00:00:00Z" },
      { status: "offer", applied_at: "2026-01-03T00:00:00Z" },
      { status: "rejected", applied_at: "2026-01-04T00:00:00Z" },
      { status: "saved", applied_at: null },
    ]);
    expect(totals.onBoard).toBe(5);
    expect(totals.applied).toBe(4);
    expect(totals.interviews).toBe(1);
    expect(totals.offers).toBe(1);
    expect(totals.rejected).toBe(1);
    // 2 of 4 sent applications drew a response (interview + offer).
    expect(totals.responseRate).toBe(50);
  });

  it("reports no response rate before anything is applied to", () => {
    const totals = summarizeJobs([
      { status: "saved", applied_at: null },
      { status: "discovered", applied_at: null },
    ]);
    expect(totals.applied).toBe(0);
    expect(totals.responseRate).toBeNull();
  });

  it("never reports a response rate above 100%", () => {
    const totals = summarizeJobs([
      { status: "interview", applied_at: "2026-01-01T00:00:00Z" },
      { status: "offer", applied_at: "2026-01-02T00:00:00Z" },
    ]);
    expect(totals.applied).toBe(2);
    expect(totals.responseRate).toBe(100);
  });
});
