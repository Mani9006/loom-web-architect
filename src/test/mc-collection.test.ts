import { describe, expect, it } from "vitest";
import {
  computePipelineStats,
  jobDedupeKey,
  matchesJobQuery,
  normalizeSessionTab,
  safeExternalUrl,
} from "@/lib/mc-collection";

describe("computePipelineStats", () => {
  it("counts jobs that progressed past applied as applied", () => {
    const stats = computePipelineStats([
      { status: "saved" },
      { status: "applied", applied_at: "2026-01-01" },
      { status: "interview", applied_at: "2026-01-01" },
      { status: "take_home" },
      { status: "offer" },
      { status: "rejected", applied_at: "2026-01-02" },
      { status: "rejected" }, // rejected without ever applying
    ]);
    expect(stats.total).toBe(7);
    expect(stats.saved).toBe(1);
    expect(stats.applied).toBe(5);
    expect(stats.interviewing).toBe(3);
    expect(stats.offer).toBe(1);
    expect(stats.rejected).toBe(2);
    expect(stats.responseRate).toBe(60);
  });

  it("never reports a response rate above 100%", () => {
    const stats = computePipelineStats([{ status: "interview" }, { status: "interview" }, { status: "offer" }]);
    expect(stats.responseRate).toBe(100);
  });

  it("returns null response rate when nothing was applied", () => {
    expect(computePipelineStats([{ status: "saved" }]).responseRate).toBeNull();
    expect(computePipelineStats([]).responseRate).toBeNull();
  });
});

describe("safeExternalUrl", () => {
  it("keeps http(s) links", () => {
    expect(safeExternalUrl("https://boards.greenhouse.io/acme/jobs/1")).toBe(
      "https://boards.greenhouse.io/acme/jobs/1",
    );
  });
  it("adds https to bare domains", () => {
    expect(safeExternalUrl(" acme.com/jobs/1 ")).toBe("https://acme.com/jobs/1");
  });
  it("rejects script and data URLs", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,hi")).toBeNull();
  });
  it("rejects empty and junk values", () => {
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl("   ")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
  });
});

describe("normalizeSessionTab", () => {
  it("accepts known tabs and rejects unknown", () => {
    expect(normalizeSessionTab("board")).toBe("board");
    expect(normalizeSessionTab("bogus")).toBeNull();
    expect(normalizeSessionTab(null)).toBeNull();
  });
});

describe("matchesJobQuery", () => {
  const job = { job_title: "ML Engineer", company: "Acme", location: "Remote", notes: null };
  it("matches any field case-insensitively", () => {
    expect(matchesJobQuery(job, "acme")).toBe(true);
    expect(matchesJobQuery(job, "remote")).toBe(true);
    expect(matchesJobQuery(job, "  ")).toBe(true);
    expect(matchesJobQuery(job, "google")).toBe(false);
  });
});

describe("jobDedupeKey", () => {
  it("normalizes case and whitespace", () => {
    expect(jobDedupeKey(" Acme  Inc ", "ML Engineer")).toBe(jobDedupeKey("acme inc", "ml   engineer"));
  });
});
