import { describe, it, expect } from "vitest";
import {
  computePipelineStats,
  statsBySession,
  topCompanies,
  jobKey,
  matchesQuery,
  sortByFit,
  wasApplied,
  safeExternalUrl,
} from "@/lib/mc-pipeline";

describe("computePipelineStats", () => {
  it("counts jobs that moved past 'applied' as applied", () => {
    const s = computePipelineStats([
      { status: "applied" },
      { status: "interview" },
      { status: "offer" },
      { status: "saved" },
    ]);
    expect(s.applied).toBe(3);
    expect(s.reachedInterview).toBe(2);
    expect(s.responseRate).toBe(67);
  });

  it("never reports a response rate above 100%", () => {
    const s = computePipelineStats([{ status: "interview" }, { status: "take_home" }, { status: "offer" }]);
    expect(s.applied).toBe(3);
    expect(s.responseRate).toBe(100);
  });

  it("treats rejected/withdrawn cards as applied only if applied_at is set", () => {
    expect(wasApplied({ status: "rejected" })).toBe(false);
    expect(wasApplied({ status: "rejected", applied_at: "2026-01-01" })).toBe(true);
    const s = computePipelineStats([{ status: "rejected", applied_at: "2026-01-01" }, { status: "withdrawn" }]);
    expect(s.applied).toBe(1);
    expect(s.rejected).toBe(1);
    expect(s.responseRate).toBe(0);
  });

  it("returns null response rate and zero counts for empty input", () => {
    const s = computePipelineStats([]);
    expect(s.total).toBe(0);
    expect(s.responseRate).toBeNull();
    expect(s.byStatus.saved).toBe(0);
  });
});

describe("statsBySession", () => {
  it("includes sessions with no rows", () => {
    const m = statsBySession(["a", "b"], [{ session_id: "a", status: "applied" }]);
    expect(m.a.applied).toBe(1);
    expect(m.b.total).toBe(0);
  });
});

describe("topCompanies", () => {
  it("groups case-insensitively and sorts by count", () => {
    const r = topCompanies([{ status: "saved", company: "Stripe" }, { status: "saved", company: "stripe " }, { status: "saved", company: "Acme" }, { status: "saved", company: "" }]);
    expect(r).toEqual([
      { company: "Stripe", count: 2 },
      { company: "Acme", count: 1 },
    ]);
  });
});

describe("jobKey", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(jobKey("Stripe, Inc.", "Senior  ML Engineer")).toBe(jobKey("stripe inc", "senior ml engineer"));
    expect(jobKey("A", "B")).not.toBe(jobKey("A", "C"));
  });
});

describe("matchesQuery", () => {
  const job = { job_title: "Data Scientist", company: "Acme", location: "Remote", notes: null };
  it("matches every term across fields", () => {
    expect(matchesQuery(job, "")).toBe(true);
    expect(matchesQuery(job, "acme data")).toBe(true);
    expect(matchesQuery(job, "acme nyc")).toBe(false);
  });
});

describe("sortByFit", () => {
  it("sorts by fit desc, stable, unscored last", () => {
    const out = sortByFit([{ id: 1 }, { id: 2, fit_score: 2 }, { id: 3, fit_score: 3 }, { id: 4, fit_score: 2 }] as { id: number; fit_score?: number }[]);
    expect(out.map((j) => j.id)).toEqual([3, 2, 4, 1]);
  });
});

describe("safeExternalUrl", () => {
  it("allows http(s) and upgrades bare domains", () => {
    expect(safeExternalUrl("https://boards.greenhouse.io/acme/jobs/1")).toBe("https://boards.greenhouse.io/acme/jobs/1");
    expect(safeExternalUrl("jobs.lever.co/acme/123")).toBe("https://jobs.lever.co/acme/123");
  });
  it("rejects script and non-web schemes", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl(" JavaScript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,hi")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});
