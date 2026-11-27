import { describe, expect, it } from "vitest";
import {
  computeCollectionStats,
  computeStatsBySession,
  hasApplied,
  jobIdentityKey,
  matchesJobQuery,
  normalizeApplyUrl,
  parseCommaList,
  parseCompTarget,
  safeExternalUrl,
  topCompanies,
} from "@/lib/my-collection";

describe("my-collection stats", () => {
  it("counts cards that moved past Applied as applications", () => {
    const stats = computeCollectionStats([
      { status: "applied" },
      { status: "interview" },
      { status: "take_home" },
      { status: "offer" },
      { status: "rejected" },
      { status: "saved" },
      { status: "discovered" },
    ]);
    expect(stats.total).toBe(7);
    expect(stats.applied).toBe(5);
    expect(stats.pipeline).toBe(2);
    expect(stats.interviews).toBe(3);
    expect(stats.offers).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.responseRate).toBe(60);
  });

  it("never reports a response rate above 100%", () => {
    const stats = computeCollectionStats([{ status: "interview" }, { status: "offer" }]);
    expect(stats.applied).toBe(2);
    expect(stats.responseRate).toBe(100);
  });

  it("returns null response rate with no applications", () => {
    expect(computeCollectionStats([{ status: "saved" }]).responseRate).toBeNull();
    expect(computeCollectionStats([]).responseRate).toBeNull();
  });

  it("treats a card moved back to hold after applying as applied", () => {
    expect(hasApplied({ status: "hold", applied_at: "2026-01-01T00:00:00Z" })).toBe(true);
    expect(hasApplied({ status: "hold", applied_at: null })).toBe(false);
  });

  it("groups by session including sessions with no rows", () => {
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

  it("ranks top companies case-insensitively", () => {
    const top = topCompanies(
      [{ status: "saved", company: "Stripe" }, { status: "saved", company: "stripe " }, { status: "saved", company: "Acme" }, { status: "saved", company: "" }],
      5,
    );
    expect(top).toEqual([
      { company: "Stripe", count: 2 },
      { company: "Acme", count: 1 },
    ]);
  });
});

describe("safeExternalUrl", () => {
  it("allows http and https", () => {
    expect(safeExternalUrl("https://boards.greenhouse.io/x/jobs/1")).toBe("https://boards.greenhouse.io/x/jobs/1");
    expect(safeExternalUrl("  http://example.org/a ")).toBe("http://example.org/a");
  });

  it("rejects script and relative URLs", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl(" JavaScript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,hi")).toBeNull();
    expect(safeExternalUrl("/jobs/1")).toBeNull();
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});

describe("input helpers", () => {
  it("builds normalized identity keys", () => {
    expect(jobIdentityKey(" Stripe ", "Senior  Engineer")).toBe(jobIdentityKey("stripe", "senior engineer"));
  });

  it("parses comma lists without blanks or duplicates", () => {
    expect(parseCommaList("ML Engineer, , ml engineer,Data Scientist ")).toEqual(["ML Engineer", "Data Scientist"]);
  });

  it("parses comp targets", () => {
    expect(parseCompTarget("$120,000")).toBe(120000);
    expect(parseCompTarget("")).toBeNull();
    expect(parseCompTarget("-5")).toBeNull();
    expect(parseCompTarget("abc")).toBeNull();
  });

  it("matches board search queries across fields", () => {
    const job = { job_title: "ML Engineer", company: "Acme", location: "Remote", notes: "referral from Sam" };
    expect(matchesJobQuery(job, "acme")).toBe(true);
    expect(matchesJobQuery(job, "REFERRAL")).toBe(true);
    expect(matchesJobQuery(job, "")).toBe(true);
    expect(matchesJobQuery(job, "google")).toBe(false);
  });
});

describe("normalizeApplyUrl", () => {
  it("accepts blank and full URLs", () => {
    expect(normalizeApplyUrl("  ")).toEqual({ ok: true, url: null });
    expect(normalizeApplyUrl("https://jobs.lever.co/acme/123")).toEqual({ ok: true, url: "https://jobs.lever.co/acme/123" });
  });

  it("adds https to bare domains", () => {
    expect(normalizeApplyUrl("linkedin.com/jobs/view/42")).toEqual({ ok: true, url: "https://linkedin.com/jobs/view/42" });
  });

  it("rejects unsafe or nonsense input", () => {
    expect(normalizeApplyUrl("javascript:alert(1)").ok).toBe(false);
    expect(normalizeApplyUrl("not a url").ok).toBe(false);
    expect(normalizeApplyUrl("foo").ok).toBe(false);
  });
});
