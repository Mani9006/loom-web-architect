import { describe, expect, it } from "vitest";
import {
  computeFunnel,
  jobKey,
  matchesBoardQuery,
  normalizeApplyUrl,
  parseDiscoverResponse,
  safeExternalUrl,
  safeFilename,
} from "@/lib/my-collection";

describe("computeFunnel", () => {
  it("counts applications cumulatively so response rate never exceeds 100%", () => {
    const f = computeFunnel([
      { status: "applied" },
      { status: "interview" },
      { status: "take_home" },
      { status: "offer" },
      { status: "saved" },
    ]);
    expect(f.total).toBe(5);
    expect(f.applied).toBe(4);
    expect(f.interviews).toBe(3);
    expect(f.offers).toBe(1);
    expect(f.saved).toBe(1);
    expect(f.responseRate).toBe(75);
  });

  it("counts withdrawn/hold cards as applied only when applied_at is set", () => {
    const f = computeFunnel([
      { status: "withdrawn", applied_at: "2026-01-01" },
      { status: "hold", applied_at: null },
    ]);
    expect(f.applied).toBe(1);
  });

  it("returns null response rate with no applications", () => {
    expect(computeFunnel([{ status: "saved" }]).responseRate).toBeNull();
  });
});

describe("safeExternalUrl", () => {
  it("allows http(s) only", () => {
    expect(safeExternalUrl("https://jobs.example.org/1")).toBe("https://jobs.example.org/1");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,hi")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});

describe("normalizeApplyUrl", () => {
  it("adds a scheme when missing", () => {
    expect(normalizeApplyUrl("stripe.com/jobs/123")).toEqual({ ok: true, url: "https://stripe.com/jobs/123" });
  });
  it("accepts blank as no URL", () => {
    expect(normalizeApplyUrl("  ")).toEqual({ ok: true, url: null });
  });
  it("rejects unsafe or bogus values", () => {
    expect(normalizeApplyUrl("javascript:alert(1)").ok).toBe(false);
    expect(normalizeApplyUrl("asdf").ok).toBe(false);
  });
});

describe("jobKey / safeFilename / matchesBoardQuery", () => {
  it("normalizes job identity", () => {
    expect(jobKey(" Stripe ", "Senior  Engineer")).toBe(jobKey("stripe", "senior engineer"));
  });
  it("strips path separators from filenames", () => {
    expect(safeFilename("Acme / ML: Engineer?")).toBe("Acme ML Engineer");
    expect(safeFilename("///")).toBe("resume");
  });
  it("matches title, company, location and notes", () => {
    const job = { job_title: "ML Engineer", company: "Acme", location: "Remote", notes: "referral from Sam" };
    expect(matchesBoardQuery(job, "acme")).toBe(true);
    expect(matchesBoardQuery(job, "REMOTE")).toBe(true);
    expect(matchesBoardQuery(job, "referral")).toBe(true);
    expect(matchesBoardQuery(job, "google")).toBe(false);
    expect(matchesBoardQuery(job, "")).toBe(true);
  });
});

describe("parseDiscoverResponse", () => {
  it("parses a fenced jobs block, dedupes, sanitizes and ranks", () => {
    const text =
      "Here you go\n```json\n" +
      JSON.stringify({
        jobs: [
          { title: "A", company: "X", fit_score: 1, apply_url: "javascript:alert(1)" },
          { title: "B", company: "Y", fit_score: "3", apply_url: "https://y.com/jobs/1" },
          { title: "b", company: "y ", fit_score: 2 },
          { title: "", company: "Z" },
        ],
      }) +
      "\n```";
    const res = parseDiscoverResponse(text);
    expect(res.kind).toBe("jobs");
    if (res.kind !== "jobs") return;
    expect(res.jobs.map((j) => j.title)).toEqual(["B", "A"]);
    expect(res.jobs[0].fit_score).toBe(3);
    expect(res.jobs[0].apply_url).toBe("https://y.com/jobs/1");
    expect(res.jobs[1].apply_url).toBeUndefined();
  });

  it("treats a bare array as a jobs list", () => {
    const res = parseDiscoverResponse('[{"title":"T","company":"C"}]');
    expect(res.kind).toBe("jobs");
  });

  it("detects clarification requests", () => {
    const res = parseDiscoverResponse(null, { needs_clarification: true, questions: ["Which city?", ""] });
    expect(res).toEqual({ kind: "clarification", questions: ["Which city?"] });
  });

  it("flags invalid and unexpected payloads", () => {
    expect(parseDiscoverResponse("I couldn't do it").kind).toBe("invalid");
    expect(parseDiscoverResponse('{"foo":1}').kind).toBe("unexpected");
  });
});
