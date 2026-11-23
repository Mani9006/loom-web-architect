import { describe, expect, it } from "vitest";
import { computeFunnel, hasApplied, statusUpdateFields } from "@/lib/mc-funnel";

describe("computeFunnel", () => {
  it("counts jobs that progressed past Applied as applied", () => {
    const f = computeFunnel([
      { status: "applied" },
      { status: "interview" },
      { status: "offer" },
      { status: "rejected" },
      { status: "saved" },
      { status: "discovered" },
    ]);
    expect(f.total).toBe(6);
    expect(f.saved).toBe(1);
    expect(f.applied).toBe(4);
    expect(f.interviews).toBe(2);
    expect(f.offers).toBe(1);
    expect(f.rejected).toBe(1);
    expect(f.responseRate).toBe(50);
  });

  it("never reports a response rate above 100%", () => {
    const f = computeFunnel([{ status: "interview" }, { status: "take_home" }, { status: "offer" }]);
    expect(f.applied).toBe(3);
    expect(f.responseRate).toBe(100);
  });

  it("returns null response rate with no applications", () => {
    expect(computeFunnel([{ status: "saved" }]).responseRate).toBeNull();
    expect(computeFunnel([]).responseRate).toBeNull();
  });

  it("uses applied_at for hold and withdrawn", () => {
    expect(hasApplied({ status: "hold", applied_at: null })).toBe(false);
    expect(hasApplied({ status: "hold", applied_at: "2026-01-01T00:00:00Z" })).toBe(true);
    expect(hasApplied({ status: "withdrawn", applied_at: "2026-01-01T00:00:00Z" })).toBe(true);
  });
});

describe("statusUpdateFields", () => {
  const now = new Date("2026-11-23T10:00:00Z");

  it("stamps applied_at when skipping straight to interview", () => {
    expect(statusUpdateFields({ applied_at: null }, "interview", now)).toEqual({
      status: "interview",
      applied_at: now.toISOString(),
    });
  });

  it("keeps an existing applied_at", () => {
    expect(statusUpdateFields({ applied_at: "2026-01-01T00:00:00Z" }, "offer", now)).toEqual({ status: "offer" });
  });

  it("does not stamp pre-apply statuses", () => {
    expect(statusUpdateFields({ applied_at: null }, "saved", now)).toEqual({ status: "saved" });
    expect(statusUpdateFields({ applied_at: null }, "hold", now)).toEqual({ status: "hold" });
  });
});
