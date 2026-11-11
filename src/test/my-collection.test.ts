import { describe, it, expect } from "vitest";
import {
  computeCollectionStats,
  normalizeApplyUrl,
  safeExternalHref,
  jobDedupKey,
  matchesJobQuery,
  sortByFit,
  parseList,
  parseCompTarget,
  isSessionTab,
} from "@/lib/my-collection";

describe("computeCollectionStats", () => {
  it("counts downstream stages as applied", () => {
    const s = computeCollectionStats([
      { status: "saved" },
      { status: "applied" },
      { status: "interview" },
      { status: "offer" },
      { status: "rejected", applied_at: "2026-01-01" },
      { status: "rejected" },
    ]);
    expect(s.total).toBe(6);
    expect(s.saved).toBe(1);
    expect(s.applied).toBe(4);
    expect(s.interviews).toBe(2);
    expect(s.offers).toBe(1);
    expect(s.rejected).toBe(2);
    expect(s.responseRate).toBe(50);
  });

  it("returns null response rate with no applications", () => {
    expect(computeCollectionStats([{ status: "saved" }]).responseRate).toBeNull();
    expect(computeCollectionStats([]).total).toBe(0);
  });
});

describe("normalizeApplyUrl", () => {
  it("adds https to bare domains", () => {
    expect(normalizeApplyUrl("stripe.com/jobs/1")).toBe("https://stripe.com/jobs/1");
  });
  it("keeps http(s) urls", () => {
    expect(normalizeApplyUrl(" https://boards.greenhouse.io/x/jobs/1 ")).toBe("https://boards.greenhouse.io/x/jobs/1");
  });
  it("rejects unsafe schemes and junk", () => {
    expect(normalizeApplyUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeApplyUrl("data:text/html,hi")).toBeNull();
    expect(normalizeApplyUrl("not a url")).toBeNull();
    expect(normalizeApplyUrl("")).toBeNull();
    expect(normalizeApplyUrl(null)).toBeNull();
    expect(safeExternalHref("JaVaScRiPt:alert(1)")).toBeNull();
  });
});

describe("jobDedupKey", () => {
  it("ignores case and extra whitespace", () => {
    expect(jobDedupKey(" Stripe ", "Senior  ML Engineer")).toBe(jobDedupKey("stripe", "senior ml engineer"));
  });
});

describe("matchesJobQuery", () => {
  const job = { job_title: "ML Engineer", company: "Stripe", location: "Remote", notes: "referral from Sam" };
  it("matches all terms across fields", () => {
    expect(matchesJobQuery(job, "")).toBe(true);
    expect(matchesJobQuery(job, "stripe remote")).toBe(true);
    expect(matchesJobQuery(job, "referral")).toBe(true);
    expect(matchesJobQuery(job, "google")).toBe(false);
  });
});

describe("sortByFit", () => {
  it("sorts by fit desc and keeps order for ties/unknowns", () => {
    const out = sortByFit([
      { id: "a" },
      { id: "b", fit_score: 1 },
      { id: "c", fit_score: 3 },
      { id: "d", fit_score: 3 },
    ]);
    expect(out.map((j) => j.id)).toEqual(["c", "d", "b", "a"]);
  });
});

describe("parseList / parseCompTarget / isSessionTab", () => {
  it("parses and dedupes lists", () => {
    expect(parseList("ML Engineer, ml engineer,\nData Scientist, ,")).toEqual(["ML Engineer", "Data Scientist"]);
  });
  it("parses comp", () => {
    expect(parseCompTarget("$150,000")).toBe(150000);
    expect(parseCompTarget("")).toBeNull();
    expect(parseCompTarget("-5")).toBeNull();
    expect(parseCompTarget("abc")).toBeNull();
  });
  it("validates tabs", () => {
    expect(isSessionTab("board")).toBe(true);
    expect(isSessionTab("bogus")).toBe(false);
    expect(isSessionTab(null)).toBe(false);
  });
});
