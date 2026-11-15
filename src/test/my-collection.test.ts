import { describe, it, expect } from "vitest";
import {
  computeCollectionStats,
  computeStatsBySession,
  hasApplied,
  jobIdentityKey,
  matchesJobQuery,
  safeExternalUrl,
  shouldStampAppliedAt,
  safeFileName,
} from "@/lib/my-collection";

describe("computeCollectionStats", () => {
  it("counts later-stage cards as applied so response rate never exceeds 100%", () => {
    const stats = computeCollectionStats([
      { status: "applied" },
      { status: "interview" },
      { status: "take_home" },
      { status: "offer" },
      { status: "saved" },
    ]);
    expect(stats.total).toBe(5);
    expect(stats.applied).toBe(4);
    expect(stats.interviews).toBe(3);
    expect(stats.offers).toBe(1);
    expect(stats.responseRate).toBe(75);
  });

  it("treats rejected cards with an applied_at as applied", () => {
    const stats = computeCollectionStats([
      { status: "rejected", applied_at: "2026-01-01T00:00:00Z" },
      { status: "rejected", applied_at: null },
    ]);
    expect(stats.applied).toBe(1);
    expect(stats.rejected).toBe(2);
    expect(stats.responseRate).toBe(0);
  });

  it("returns null response rate when nothing was applied", () => {
    expect(computeCollectionStats([{ status: "saved" }]).responseRate).toBeNull();
    expect(computeCollectionStats([]).total).toBe(0);
  });

  it("ignores unknown statuses in byStatus without crashing", () => {
    const stats = computeCollectionStats([{ status: "weird" }]);
    expect(stats.total).toBe(1);
    expect(Object.values(stats.byStatus).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("computeStatsBySession", () => {
  it("returns an entry for every session, including empty ones", () => {
    const map = computeStatsBySession(["a", "b"], [
      { session_id: "a", status: "applied" },
      { session_id: "a", status: "saved" },
      { session_id: "zzz", status: "applied" },
    ]);
    expect(map.a.total).toBe(2);
    expect(map.a.applied).toBe(1);
    expect(map.b.total).toBe(0);
    expect(map.zzz).toBeUndefined();
  });
});

describe("hasApplied / shouldStampAppliedAt", () => {
  it("stamps applied_at for any post-apply stage", () => {
    expect(shouldStampAppliedAt("interview")).toBe(true);
    expect(shouldStampAppliedAt("offer")).toBe(true);
    expect(shouldStampAppliedAt("saved")).toBe(false);
    expect(shouldStampAppliedAt("hold")).toBe(false);
  });
  it("detects applied by status", () => {
    expect(hasApplied({ status: "viewed" })).toBe(true);
    expect(hasApplied({ status: "discovered" })).toBe(false);
  });
});

describe("safeExternalUrl", () => {
  it("accepts http(s) URLs", () => {
    expect(safeExternalUrl("https://boards.greenhouse.io/acme/jobs/123")).toBe(
      "https://boards.greenhouse.io/acme/jobs/123",
    );
    expect(safeExternalUrl("  http://example.org/job ")).toBe("http://example.org/job");
  });
  it("adds https to bare domains", () => {
    expect(safeExternalUrl("jobs.lever.co/acme/abc")).toBe("https://jobs.lever.co/acme/abc");
  });
  it("rejects dangerous or malformed values", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,hi")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});

describe("jobIdentityKey / matchesJobQuery", () => {
  it("normalizes case and whitespace", () => {
    expect(jobIdentityKey(" Acme  Inc ", "ML Engineer")).toBe(jobIdentityKey("acme inc", "ml   engineer"));
  });
  it("matches query across fields", () => {
    const job = { job_title: "Data Scientist", company: "Acme", location: "Remote", notes: "referral from Sam" };
    expect(matchesJobQuery(job, "acme")).toBe(true);
    expect(matchesJobQuery(job, "REMOTE")).toBe(true);
    expect(matchesJobQuery(job, "referral")).toBe(true);
    expect(matchesJobQuery(job, "nurse")).toBe(false);
    expect(matchesJobQuery(job, "  ")).toBe(true);
  });
});

describe("safeFileName", () => {
  it("strips path separators and reserved characters", () => {
    expect(safeFileName("Acme/Corp: ML Engineer?")).toBe("Acme Corp ML Engineer");
    expect(safeFileName("..hidden")).toBe("hidden");
  });
  it("falls back when empty", () => {
    expect(safeFileName("  ")).toBe("resume");
    expect(safeFileName(null, "x")).toBe("x");
  });
});
