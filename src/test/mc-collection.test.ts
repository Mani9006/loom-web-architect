import { describe, expect, it } from "vitest";
import {
  computeCollectionStats,
  jobKey,
  matchesJobQuery,
  normalizeFitScore,
  safeExternalUrl,
  safeFilename,
  statusUpdatePatch,
} from "@/lib/mc-collection";

describe("computeCollectionStats", () => {
  it("counts cards that progressed past applied as applications", () => {
    const stats = computeCollectionStats([
      { status: "applied", applied_at: "2026-01-01" },
      { status: "interview", applied_at: null },
      { status: "offer", applied_at: "2026-01-02" },
      { status: "rejected", applied_at: "2026-01-03" },
      { status: "saved" },
      { status: "discovered" },
    ]);
    expect(stats.total).toBe(6);
    expect(stats.applied).toBe(4);
    expect(stats.saved).toBe(2);
    expect(stats.interviews).toBe(1);
    expect(stats.offers).toBe(1);
    expect(stats.rejected).toBe(1);
    // interview + offer responded out of 4 applications
    expect(stats.responseRate).toBe(50);
  });

  it("never reports a response rate above 100%", () => {
    const stats = computeCollectionStats([{ status: "interview" }, { status: "take_home" }]);
    expect(stats.applied).toBe(2);
    expect(stats.responseRate).toBe(100);
  });

  it("returns null response rate with no applications", () => {
    expect(computeCollectionStats([{ status: "saved" }]).responseRate).toBeNull();
    expect(computeCollectionStats([]).responseRate).toBeNull();
  });

  it("does not count a rejected card that was never applied to", () => {
    expect(computeCollectionStats([{ status: "rejected", applied_at: null }]).applied).toBe(0);
  });
});

describe("statusUpdatePatch", () => {
  const now = new Date("2026-05-01T00:00:00.000Z");
  it("stamps applied_at when jumping straight to interview", () => {
    expect(statusUpdatePatch({ applied_at: null }, "interview", now)).toEqual({
      status: "interview",
      applied_at: now.toISOString(),
    });
  });
  it("keeps an existing applied_at", () => {
    expect(statusUpdatePatch({ applied_at: "2026-01-01" }, "offer", now)).toEqual({ status: "offer" });
  });
  it("does not stamp for pre-apply columns", () => {
    expect(statusUpdatePatch({ applied_at: null }, "saved", now)).toEqual({ status: "saved" });
  });
});

describe("safeExternalUrl", () => {
  it("accepts http(s) urls", () => {
    expect(safeExternalUrl("https://jobs.lever.co/acme/123")).toBe("https://jobs.lever.co/acme/123");
  });
  it("adds https to bare domains", () => {
    expect(safeExternalUrl("boards.greenhouse.io/acme/jobs/1")).toBe("https://boards.greenhouse.io/acme/jobs/1");
  });
  it("rejects dangerous or junk values", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,hi")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});

describe("misc helpers", () => {
  it("jobKey is case and whitespace insensitive", () => {
    expect(jobKey(" Acme  Inc ", "ML Engineer")).toBe(jobKey("acme inc", "ml   engineer"));
  });
  it("normalizeFitScore coerces and clamps", () => {
    expect(normalizeFitScore("3")).toBe(3);
    expect(normalizeFitScore(2.4)).toBe(2);
    expect(normalizeFitScore(9)).toBe(3);
    expect(normalizeFitScore("strong")).toBeUndefined();
    expect(normalizeFitScore(undefined)).toBeUndefined();
  });
  it("safeFilename strips path characters", () => {
    expect(safeFilename("Acme/Corp: ML Engineer")).toBe("Acme Corp ML Engineer");
    expect(safeFilename("   ")).toBe("resume");
  });
  it("matchesJobQuery searches title, company, location and notes", () => {
    const job = { job_title: "Data Scientist", company: "Acme", location: "Remote", notes: "referral from Sam" };
    expect(matchesJobQuery(job, "acme")).toBe(true);
    expect(matchesJobQuery(job, "REMOTE")).toBe(true);
    expect(matchesJobQuery(job, "referral")).toBe(true);
    expect(matchesJobQuery(job, "")).toBe(true);
    expect(matchesJobQuery(job, "nurse")).toBe(false);
  });
});
