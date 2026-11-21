import { describe, expect, it } from "vitest";
import { computePipelineStats, hasApplied, toSafeExternalUrl, trackedJobKey } from "@/lib/mc-pipeline";

describe("hasApplied", () => {
  it("counts later stages as applied", () => {
    expect(hasApplied({ status: "interview" })).toBe(true);
    expect(hasApplied({ status: "offer" })).toBe(true);
    expect(hasApplied({ status: "rejected" })).toBe(true);
    expect(hasApplied({ status: "saved" })).toBe(false);
    expect(hasApplied({ status: "discovered" })).toBe(false);
  });

  it("only counts withdrawn when an application date exists", () => {
    expect(hasApplied({ status: "withdrawn" })).toBe(false);
    expect(hasApplied({ status: "withdrawn", applied_at: "2026-01-01T00:00:00Z" })).toBe(true);
  });
});

describe("computePipelineStats", () => {
  const now = new Date("2026-11-21T12:00:00Z");

  it("never reports a response rate above 100%", () => {
    const stats = computePipelineStats(
      [{ status: "interview" }, { status: "offer" }, { status: "applied" }],
      now,
    );
    expect(stats.applied).toBe(3);
    expect(stats.interviews).toBe(2);
    expect(stats.responseRate).toBe(67);
  });

  it("returns null response rate with no applications", () => {
    const stats = computePipelineStats([{ status: "saved" }, { status: "discovered" }], now);
    expect(stats.responseRate).toBeNull();
    expect(stats.saved).toBe(1);
    expect(stats.total).toBe(2);
  });

  it("counts applications in the last 7 days", () => {
    const stats = computePipelineStats(
      [
        { status: "applied", applied_at: "2026-11-20T00:00:00Z" },
        { status: "applied", applied_at: "2026-11-01T00:00:00Z" },
        { status: "applied", applied_at: "not-a-date" },
      ],
      now,
    );
    expect(stats.appliedThisWeek).toBe(1);
  });

  it("groups top companies case-insensitively", () => {
    const stats = computePipelineStats(
      [
        { status: "saved", company: "Stripe" },
        { status: "saved", company: "stripe " },
        { status: "saved", company: "Plaid" },
        { status: "saved", company: "" },
      ],
      now,
    );
    expect(stats.topCompanies[0]).toEqual({ company: "Stripe", count: 2 });
    expect(stats.topCompanies).toHaveLength(2);
  });
});

describe("toSafeExternalUrl", () => {
  it("keeps http(s) URLs", () => {
    expect(toSafeExternalUrl("https://stripe.com/jobs/1")).toBe("https://stripe.com/jobs/1");
    expect(toSafeExternalUrl("http://example.org")).toBe("http://example.org/");
  });

  it("adds https to bare domains", () => {
    expect(toSafeExternalUrl("stripe.com/jobs/1")).toBe("https://stripe.com/jobs/1");
    expect(toSafeExternalUrl("  www.lever.co/acme  ")).toBe("https://www.lever.co/acme");
  });

  it("rejects dangerous or junk values", () => {
    expect(toSafeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(toSafeExternalUrl("data:text/html,hi")).toBeNull();
    expect(toSafeExternalUrl("not a url")).toBeNull();
    expect(toSafeExternalUrl("")).toBeNull();
    expect(toSafeExternalUrl(null)).toBeNull();
  });
});

describe("trackedJobKey", () => {
  it("normalizes case and whitespace", () => {
    expect(trackedJobKey(" Stripe ", "Senior  Engineer")).toBe(trackedJobKey("stripe", "senior engineer"));
  });
});
