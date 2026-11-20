import { describe, expect, it } from "vitest";
import {
  computeSessionStats,
  escapeLike,
  jobKey,
  matchesBoardQuery,
  needsFollowUp,
  parseFitScore,
  safeExternalUrl,
  safeFilename,
} from "@/lib/my-collection";

describe("computeSessionStats", () => {
  it("returns zeros and null rate for an empty board", () => {
    expect(computeSessionStats([])).toEqual({
      onBoard: 0,
      applied: 0,
      interviews: 0,
      offers: 0,
      rejected: 0,
      responses: 0,
      responseRate: null,
    });
  });

  it("counts cards that moved past 'applied' as applied", () => {
    const stats = computeSessionStats([
      { status: "saved" },
      { status: "applied" },
      { status: "interview" },
      { status: "offer" },
    ]);
    expect(stats.onBoard).toBe(4);
    expect(stats.applied).toBe(3);
    expect(stats.interviews).toBe(1);
    expect(stats.offers).toBe(1);
    expect(stats.responseRate).toBe(67);
  });

  it("never reports a response rate above 100%", () => {
    const stats = computeSessionStats([{ status: "interview" }, { status: "take_home" }, { status: "offer" }]);
    expect(stats.applied).toBe(3);
    expect(stats.responseRate).toBe(100);
  });

  it("uses applied_at for rejected/withdrawn cards", () => {
    const stats = computeSessionStats([
      { status: "rejected", applied_at: "2026-01-01T00:00:00Z" },
      { status: "rejected", applied_at: null },
      { status: "withdrawn", applied_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(stats.applied).toBe(2);
    expect(stats.rejected).toBe(2);
    expect(stats.responseRate).toBe(0);
  });
});

describe("safeExternalUrl", () => {
  it("keeps http(s) urls", () => {
    expect(safeExternalUrl("https://boards.greenhouse.io/acme/jobs/1")).toBe(
      "https://boards.greenhouse.io/acme/jobs/1",
    );
    expect(safeExternalUrl("  http://acme.com/jobs  ")).toBe("http://acme.com/jobs");
  });

  it("upgrades bare domains to https", () => {
    expect(safeExternalUrl("stripe.com/jobs/123")).toBe("https://stripe.com/jobs/123");
    expect(safeExternalUrl("//acme.com/x")).toBe("https://acme.com/x");
  });

  it("rejects script and non-web schemes", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("JavaScript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,hi")).toBeNull();
    expect(safeExternalUrl("mailto:a@b.com")).toBeNull();
  });

  it("rejects empty or garbage input", () => {
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
    expect(safeExternalUrl("https://localhost")).toBeNull();
  });
});

describe("jobKey", () => {
  it("ignores case and whitespace differences", () => {
    expect(jobKey(" Stripe ", "Senior  ML Engineer")).toBe(jobKey("stripe", "senior ml engineer"));
  });
});

describe("safeFilename", () => {
  it("strips characters that break downloads", () => {
    expect(safeFilename('Acme/Corp: "ML" Engineer?')).toBe("Acme Corp ML Engineer");
  });
  it("falls back when nothing is left", () => {
    expect(safeFilename("///", "resume")).toBe("resume");
  });
});

describe("parseFitScore", () => {
  it("coerces and clamps", () => {
    expect(parseFitScore(3)).toBe(3);
    expect(parseFitScore("2")).toBe(2);
    expect(parseFitScore(2.6)).toBe(3);
    expect(parseFitScore(9)).toBe(3);
    expect(parseFitScore(0)).toBe(1);
    expect(parseFitScore("strong")).toBeUndefined();
    expect(parseFitScore(null)).toBeUndefined();
  });
});

describe("matchesBoardQuery", () => {
  const job = { job_title: "ML Engineer", company: "Stripe", location: "Remote", notes: "referral from Sam" };
  it("matches any field case-insensitively", () => {
    expect(matchesBoardQuery(job, "stripe")).toBe(true);
    expect(matchesBoardQuery(job, "REMOTE")).toBe(true);
    expect(matchesBoardQuery(job, "referral")).toBe(true);
    expect(matchesBoardQuery(job, "")).toBe(true);
    expect(matchesBoardQuery(job, "google")).toBe(false);
  });
});

describe("escapeLike", () => {
  it("escapes wildcard characters", () => {
    expect(escapeLike(" 100%_Remote\\ ")).toBe("100\\%\\_Remote\\\\");
  });
});

describe("needsFollowUp", () => {
  const now = new Date("2026-03-15T00:00:00Z");
  it("flags applied cards idle for 7+ days", () => {
    expect(needsFollowUp({ status: "applied", updated_at: "2026-03-08T00:00:00Z" }, now)).toBe(true);
    expect(needsFollowUp({ status: "viewed", applied_at: "2026-03-01T00:00:00Z" }, now)).toBe(true);
  });
  it("ignores recent or non-applied cards", () => {
    expect(needsFollowUp({ status: "applied", updated_at: "2026-03-10T00:00:00Z" }, now)).toBe(false);
    expect(needsFollowUp({ status: "interview", updated_at: "2026-01-01T00:00:00Z" }, now)).toBe(false);
    expect(needsFollowUp({ status: "applied" }, now)).toBe(false);
  });
});
