import { describe, expect, it } from "vitest";
import { computeFunnel, statusChangeUpdates, wasApplied } from "@/lib/mc-funnel";

describe("computeFunnel", () => {
  it("returns zeros and null rates for an empty board", () => {
    const f = computeFunnel([]);
    expect(f.total).toBe(0);
    expect(f.applied).toBe(0);
    expect(f.interviewRate).toBeNull();
    expect(f.offerRate).toBeNull();
  });

  it("counts later-stage cards as applied (cumulative funnel)", () => {
    const f = computeFunnel([
      { status: "saved" },
      { status: "applied" },
      { status: "interview" },
      { status: "take_home" },
      { status: "offer" },
    ]);
    expect(f.total).toBe(5);
    expect(f.pipeline).toBe(1);
    expect(f.applied).toBe(4);
    expect(f.interviews).toBe(3);
    expect(f.offers).toBe(1);
    expect(f.interviewRate).toBe(75);
    expect(f.offerRate).toBe(25);
  });

  it("never reports an interview rate above 100%", () => {
    // Previously: 1 "applied" + 3 interviews => 300%.
    const f = computeFunnel([
      { status: "applied" },
      { status: "interview" },
      { status: "interview" },
      { status: "interview" },
    ]);
    expect(f.applied).toBe(4);
    expect(f.interviewRate).toBe(75);
  });

  it("uses applied_at to count rejected/withdrawn/hold cards as applied", () => {
    const f = computeFunnel([
      { status: "rejected", applied_at: "2026-01-01T00:00:00Z" },
      { status: "rejected", applied_at: null },
      { status: "hold", applied_at: "2026-01-02T00:00:00Z" },
      { status: "withdrawn", applied_at: "2026-01-03T00:00:00Z" },
    ]);
    expect(f.applied).toBe(3);
    expect(f.rejected).toBe(2);
    expect(f.withdrawn).toBe(1);
    // only the hold card is still in-flight
    expect(f.active).toBe(1);
  });

  it("tallies raw statuses", () => {
    const f = computeFunnel([{ status: "saved" }, { status: "saved" }, { status: "offer" }]);
    expect(f.byStatus).toEqual({ saved: 2, offer: 1 });
  });
});

describe("wasApplied", () => {
  it("is false for pre-application cards without a stamp", () => {
    expect(wasApplied({ status: "discovered" })).toBe(false);
    expect(wasApplied({ status: "saved", applied_at: null })).toBe(false);
  });
});

describe("statusChangeUpdates", () => {
  const now = new Date("2026-05-01T12:00:00Z");

  it("stamps applied_at when skipping straight to interview", () => {
    expect(statusChangeUpdates({ applied_at: null }, "interview", now)).toEqual({
      status: "interview",
      applied_at: now.toISOString(),
    });
  });

  it("keeps an existing applied_at", () => {
    expect(statusChangeUpdates({ applied_at: "2026-01-01T00:00:00Z" }, "offer", now)).toEqual({
      status: "offer",
    });
  });

  it("does not stamp for pre-application or terminal moves", () => {
    expect(statusChangeUpdates({ applied_at: null }, "saved", now)).toEqual({ status: "saved" });
    expect(statusChangeUpdates({ applied_at: null }, "rejected", now)).toEqual({ status: "rejected" });
  });
});
