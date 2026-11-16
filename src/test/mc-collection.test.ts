import { describe, it, expect } from "vitest";
import {
  summarizeTrackedJobs,
  impliesApplied,
  isTrackedStatus,
  jobIdentityKey,
  matchesJobQuery,
  safeExternalUrl,
} from "@/lib/mc-collection";

describe("summarizeTrackedJobs", () => {
  it("returns zeros and a null response rate for an empty board", () => {
    expect(summarizeTrackedJobs([])).toEqual({
      total: 0,
      saved: 0,
      applied: 0,
      interviews: 0,
      offers: 0,
      rejected: 0,
      responseRate: null,
    });
  });

  it("counts applied cumulatively so progressing a card doesn't lower it", () => {
    const s = summarizeTrackedJobs([
      { status: "applied" },
      { status: "interview" },
      { status: "offer" },
      { status: "saved" },
    ]);
    expect(s.applied).toBe(3);
    expect(s.interviews).toBe(2);
    expect(s.offers).toBe(1);
    expect(s.saved).toBe(1);
    expect(s.total).toBe(4);
  });

  it("never reports a response rate above 100%", () => {
    const s = summarizeTrackedJobs([{ status: "interview" }, { status: "take_home" }, { status: "offer" }]);
    expect(s.responseRate).toBe(100);
  });

  it("counts rejected cards as applied only when applied_at is set", () => {
    const s = summarizeTrackedJobs([
      { status: "rejected", applied_at: "2026-01-01T00:00:00Z" },
      { status: "rejected", applied_at: null },
    ]);
    expect(s.applied).toBe(1);
    expect(s.rejected).toBe(2);
  });
});

describe("status helpers", () => {
  it("knows which statuses imply an application", () => {
    expect(impliesApplied("interview")).toBe(true);
    expect(impliesApplied("saved")).toBe(false);
    expect(impliesApplied("rejected")).toBe(false);
  });

  it("validates status strings", () => {
    expect(isTrackedStatus("take_home")).toBe(true);
    expect(isTrackedStatus("bogus")).toBe(false);
    expect(isTrackedStatus(undefined)).toBe(false);
  });
});

describe("jobIdentityKey", () => {
  it("normalizes case and whitespace", () => {
    expect(jobIdentityKey(" Acme  Corp ", "ML Engineer")).toBe(jobIdentityKey("acme corp", "ml   engineer"));
  });
});

describe("matchesJobQuery", () => {
  const job = { job_title: "Senior ML Engineer", company: "Acme", location: "Remote", notes: "referral from Sam" };
  it("matches every term across fields", () => {
    expect(matchesJobQuery(job, "acme remote")).toBe(true);
    expect(matchesJobQuery(job, "referral")).toBe(true);
    expect(matchesJobQuery(job, "acme onsite")).toBe(false);
  });
  it("treats a blank query as a match", () => {
    expect(matchesJobQuery(job, "   ")).toBe(true);
  });
});

describe("safeExternalUrl", () => {
  it("passes through http(s) URLs", () => {
    expect(safeExternalUrl("https://jobs.acme.com/1")).toBe("https://jobs.acme.com/1");
  });
  it("upgrades bare hosts to https", () => {
    expect(safeExternalUrl("jobs.acme.com/1")).toBe("https://jobs.acme.com/1");
  });
  it("rejects dangerous or junk values", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,hi")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});
