import { describe, expect, it } from "vitest";
import {
  computeCollectionStats,
  isPostApplyStatus,
  isSessionTab,
  jobIdentityKey,
  normalizeFitScore,
  parseCompTarget,
  parseList,
  preserveLinePrefix,
  safeFilename,
  safeHttpUrl,
} from "@/lib/my-collection";

describe("computeCollectionStats", () => {
  it("counts applications cumulatively across later stages", () => {
    const stats = computeCollectionStats([
      { status: "saved" },
      { status: "applied" },
      { status: "interview" },
      { status: "take_home" },
      { status: "offer" },
      { status: "rejected", applied_at: "2026-01-01T00:00:00Z" },
      { status: "rejected" },
      { status: "discovered" },
    ]);
    expect(stats.total).toBe(8);
    expect(stats.saved).toBe(1);
    expect(stats.applied).toBe(5);
    expect(stats.interviews).toBe(2);
    expect(stats.offers).toBe(1);
    expect(stats.rejected).toBe(2);
    expect(stats.responseRate).toBe(60);
  });

  it("never reports a response rate above 100%", () => {
    const stats = computeCollectionStats([{ status: "interview" }, { status: "offer" }]);
    expect(stats.applied).toBe(2);
    expect(stats.responseRate).toBe(100);
  });

  it("returns null response rate with no applications", () => {
    expect(computeCollectionStats([{ status: "saved" }]).responseRate).toBeNull();
    expect(computeCollectionStats([]).total).toBe(0);
  });
});

describe("safeHttpUrl", () => {
  it("accepts http(s) links", () => {
    expect(safeHttpUrl("https://boards.greenhouse.io/x/jobs/1")).toBe("https://boards.greenhouse.io/x/jobs/1");
    expect(safeHttpUrl("  http://example.org/a ")).toBe("http://example.org/a");
  });
  it("adds https to bare domains", () => {
    expect(safeHttpUrl("stripe.com/jobs/123")).toBe("https://stripe.com/jobs/123");
  });
  it("rejects dangerous or junk values", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});

describe("misc helpers", () => {
  it("validates session tabs", () => {
    expect(isSessionTab("board")).toBe(true);
    expect(isSessionTab("bogus")).toBe(false);
    expect(isSessionTab(null)).toBe(false);
  });

  it("detects post-apply statuses", () => {
    expect(isPostApplyStatus("interview")).toBe(true);
    expect(isPostApplyStatus("saved")).toBe(false);
  });

  it("normalizes job identity", () => {
    expect(jobIdentityKey(" Stripe ", "Senior  ML Engineer")).toBe(jobIdentityKey("stripe", "senior ml engineer"));
  });

  it("normalizes fit scores", () => {
    expect(normalizeFitScore("3")).toBe(3);
    expect(normalizeFitScore(2.6)).toBe(3);
    expect(normalizeFitScore(9)).toBe(3);
    expect(normalizeFitScore(0)).toBe(1);
    expect(normalizeFitScore("strong")).toBeUndefined();
  });

  it("parses lists without blanks or duplicates", () => {
    expect(parseList("ML Engineer, ml engineer,\nData Scientist, ,")).toEqual(["ML Engineer", "Data Scientist"]);
  });

  it("parses compensation targets", () => {
    expect(parseCompTarget("$150k")).toBe(150000);
    expect(parseCompTarget("120,000")).toBe(120000);
    expect(parseCompTarget("-5")).toBeNull();
    expect(parseCompTarget("")).toBeNull();
    expect(parseCompTarget("abc")).toBeNull();
  });

  it("sanitizes filenames", () => {
    expect(safeFilename("Acme/Inc: ML <Eng>")).toBe("AcmeInc ML Eng");
    expect(safeFilename("...")).toBe("resume");
  });

  it("keeps bullet markers when applying AI suggestions", () => {
    expect(preserveLinePrefix("- Built a thing", "Shipped a platform")).toBe("- Shipped a platform");
    expect(preserveLinePrefix("  * Built", "- Shipped")).toBe("  - Shipped");
    expect(preserveLinePrefix("1. Built", "Shipped")).toBe("1. Shipped");
    expect(preserveLinePrefix("Plain line", " Better line ")).toBe("Better line");
  });
});

describe("escapeLikePattern", () => {
  it("escapes wildcard characters", async () => {
    const { escapeLikePattern } = await import("@/lib/my-collection");
    expect(escapeLikePattern("100%_Remote\\")).toBe("100\\%\\_Remote\\\\");
    expect(escapeLikePattern("Stripe")).toBe("Stripe");
  });
});
