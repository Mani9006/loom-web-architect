import { describe, expect, it } from "vitest";
import { computeSessionStats, filterJobsByQuery, parseCompTarget, parseListInput } from "@/lib/mc-stats";

describe("computeSessionStats", () => {
  it("returns zeros and null response rate for an empty board", () => {
    const s = computeSessionStats([]);
    expect(s.total).toBe(0);
    expect(s.applied).toBe(0);
    expect(s.responseRate).toBeNull();
  });

  it("counts later pipeline stages as applied", () => {
    const s = computeSessionStats([
      { status: "applied" },
      { status: "interview" },
      { status: "offer" },
      { status: "saved" },
    ]);
    expect(s.applied).toBe(3);
    expect(s.interviews).toBe(2);
    expect(s.offers).toBe(1);
    expect(s.responseRate).toBe(67);
  });

  it("never reports a response rate above 100%", () => {
    const s = computeSessionStats([{ status: "interview" }, { status: "take_home" }, { status: "offer" }]);
    expect(s.applied).toBe(3);
    expect(s.responseRate).toBe(100);
  });

  it("counts rejected cards as applied only when an applied_at exists", () => {
    const s = computeSessionStats([
      { status: "rejected", applied_at: "2026-01-01T00:00:00Z" },
      { status: "rejected", applied_at: null },
      { status: "withdrawn" },
    ]);
    expect(s.applied).toBe(1);
    expect(s.rejected).toBe(2);
    expect(s.open).toBe(0);
  });

  it("tallies every status bucket", () => {
    const s = computeSessionStats([{ status: "hold" }, { status: "hold" }, { status: "discovered" }]);
    expect(s.byStatus.hold).toBe(2);
    expect(s.byStatus.discovered).toBe(1);
    expect(s.open).toBe(3);
  });
});

describe("filterJobsByQuery", () => {
  const jobs = [
    { job_title: "ML Engineer", company: "Acme", location: "Remote", notes: null },
    { job_title: "Data Scientist", company: "Globex", location: "New York", notes: "referral from Sam" },
  ];

  it("returns everything for a blank query", () => {
    expect(filterJobsByQuery(jobs, "   ")).toHaveLength(2);
  });

  it("matches across title, company, location and notes, case-insensitively", () => {
    expect(filterJobsByQuery(jobs, "acme")).toHaveLength(1);
    expect(filterJobsByQuery(jobs, "new york")).toHaveLength(1);
    expect(filterJobsByQuery(jobs, "REFERRAL")).toHaveLength(1);
    expect(filterJobsByQuery(jobs, "engineer globex")).toHaveLength(0);
  });
});

describe("parseListInput", () => {
  it("splits on commas and newlines, trims and de-duplicates", () => {
    expect(parseListInput("ML Engineer, ml engineer,\nData Scientist , ,")).toEqual(["ML Engineer", "Data Scientist"]);
  });
});

describe("parseCompTarget", () => {
  it("parses plain, formatted and k-suffixed amounts", () => {
    expect(parseCompTarget("120000")).toBe(120000);
    expect(parseCompTarget("$120,000")).toBe(120000);
    expect(parseCompTarget("150k")).toBe(150000);
  });

  it("rejects blank, garbage and non-positive values", () => {
    expect(parseCompTarget("")).toBeNull();
    expect(parseCompTarget("abc")).toBeNull();
    expect(parseCompTarget("-5")).toBeNull();
    expect(parseCompTarget("0")).toBeNull();
  });
});
