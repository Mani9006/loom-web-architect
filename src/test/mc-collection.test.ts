import { describe, expect, it } from "vitest";
import {
  computeSessionFunnel,
  dedupeAndRankJobs,
  jobKey,
  matchesJobFilter,
  normalizeFitScore,
  safeExternalUrl,
  sanitizeFilename,
  applyLineSuggestion,
  splitMarkdownLinePrefix,
} from "@/lib/mc-collection";

describe("computeSessionFunnel", () => {
  it("counts cards that progressed past Applied as applied", () => {
    const f = computeSessionFunnel([
      { status: "applied" },
      { status: "interview" },
      { status: "take_home" },
      { status: "offer" },
      { status: "saved" },
      { status: "discovered" },
    ]);
    expect(f.total).toBe(6);
    expect(f.applied).toBe(4);
    expect(f.interviews).toBe(2);
    expect(f.offers).toBe(1);
    expect(f.saved).toBe(1);
    expect(f.responseRate).toBe(75);
  });

  it("counts rejected/withdrawn cards as applied only when applied_at is set", () => {
    const f = computeSessionFunnel([
      { status: "rejected", applied_at: "2026-01-01T00:00:00Z" },
      { status: "rejected", applied_at: null },
      { status: "withdrawn", applied_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(f.applied).toBe(2);
    expect(f.rejected).toBe(2);
  });

  it("never reports a response rate above 100% and null when nothing applied", () => {
    expect(computeSessionFunnel([{ status: "saved" }]).responseRate).toBeNull();
    expect(computeSessionFunnel([{ status: "interview" }]).responseRate).toBe(100);
  });
});

describe("safeExternalUrl", () => {
  it("allows http(s) links", () => {
    expect(safeExternalUrl("https://boards.greenhouse.io/acme/jobs/1")).toBe(
      "https://boards.greenhouse.io/acme/jobs/1",
    );
    expect(safeExternalUrl("  http://example.org/x ")).toBe("http://example.org/x");
  });

  it("upgrades bare domains to https", () => {
    expect(safeExternalUrl("jobs.lever.co/acme/123")).toBe("https://jobs.lever.co/acme/123");
  });

  it("rejects script and data URLs and garbage", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,<script>1</script>")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});

describe("normalizeFitScore", () => {
  it("coerces strings and clamps to 1-3", () => {
    expect(normalizeFitScore("3")).toBe(3);
    expect(normalizeFitScore(2.4)).toBe(2);
    expect(normalizeFitScore(7)).toBe(3);
    expect(normalizeFitScore(0)).toBe(1);
    expect(normalizeFitScore("strong")).toBeUndefined();
    expect(normalizeFitScore(undefined)).toBeUndefined();
  });
});

describe("dedupeAndRankJobs", () => {
  it("removes duplicates and sorts strongest fit first, keeping order on ties", () => {
    const ranked = dedupeAndRankJobs([
      { company: "A", title: "Eng", fit_score: 1 },
      { company: "B", title: "Eng", fit_score: 3 },
      { company: "a ", title: "eng", fit_score: 3 },
      { company: "C", title: "Eng" },
      { company: "D", title: "Eng", fit_score: 3 },
    ]);
    expect(ranked.map((j) => j.company)).toEqual(["B", "D", "A", "C"]);
  });

  it("builds case-insensitive keys", () => {
    expect(jobKey(" Stripe ", "Senior  Engineer")).toBe(jobKey("stripe", "senior engineer"));
  });
});

describe("sanitizeFilename", () => {
  it("strips path separators and reserved characters", () => {
    expect(sanitizeFilename("Acme, ML/AI Engineer: Remote?")).toBe("Acme, ML AI Engineer Remote");
    expect(sanitizeFilename("../../etc")).toBe("etc");
    expect(sanitizeFilename("   ")).toBe("resume");
  });
});

describe("matchesJobFilter", () => {
  const job = { job_title: "Data Scientist", company: "Plaid", location: "Remote", notes: "referral from Sam" };
  it("matches any field case-insensitively", () => {
    expect(matchesJobFilter(job, "plaid")).toBe(true);
    expect(matchesJobFilter(job, "REMOTE")).toBe(true);
    expect(matchesJobFilter(job, "referral")).toBe(true);
    expect(matchesJobFilter(job, "")).toBe(true);
    expect(matchesJobFilter(job, "stripe")).toBe(false);
  });
});

describe("applyLineSuggestion", () => {
  it("keeps the original bullet marker and indent", () => {
    expect(applyLineSuggestion("  - Did stuff", "Led a team of 5 to ship X")).toBe("  - Led a team of 5 to ship X");
  });
  it("strips markers and quotes the AI added", () => {
    expect(applyLineSuggestion("- Did stuff", '- "Shipped X, cutting cost 20%"')).toBe("- Shipped X, cutting cost 20%");
    expect(applyLineSuggestion("Plain line", "• not a md marker")).toBe("• not a md marker");
  });
  it("splits headings", () => {
    expect(splitMarkdownLinePrefix("## Experience")).toEqual({ prefix: "## ", body: "Experience" });
  });
});
