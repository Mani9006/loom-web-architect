import { describe, expect, it } from "vitest";
import {
  ATS_CATALOG,
  detectAtsFromUrl,
  isLiveSubmitAts,
  LIVE_SUBMIT_ADAPTERS,
} from "@/lib/ats-detect";

describe("ATS detector", () => {
  it("covers the public 29 ATS names plus account-gated boards", () => {
    const slugs = ATS_CATALOG.map((entry) => entry.slug);
    for (const required of [
      "greenhouse", "lever", "ashby", "workday", "icims", "smartrecruiters",
      "workable", "jobvite", "successfactors", "oraclecloud", "rippling",
      "phenom", "bamboohr", "jazzhr", "breezyhr", "recruitee", "teamtailor",
      "pinpoint", "polymer", "dover", "gem", "brassring", "dayforce",
      "hireology", "join", "paylocity", "ultipro", "adp", "zohorecruit",
    ]) {
      expect(slugs).toContain(required);
    }
    expect(slugs).toContain("indeed");
    expect(slugs).toContain("naukri");
  });

  it("treats only live adapters as submittable", () => {
    expect(LIVE_SUBMIT_ADAPTERS.sort()).toEqual(["ashby", "greenhouse", "lever", "workable", "workday"].sort());
    expect(isLiveSubmitAts("greenhouse")).toBe(true);
    expect(isLiveSubmitAts("icims")).toBe(false);
    expect(isLiveSubmitAts("indeed")).toBe(false);
  });

  it("detects Greenhouse, Lever, Ashby, Workable, and Workday from URL alone", () => {
    expect(detectAtsFromUrl("https://boards.greenhouse.io/acme/jobs/123").ats).toBe("greenhouse");
    expect(detectAtsFromUrl("https://jobs.lever.co/acme/uuid/apply").submittable).toBe(true);
    expect(detectAtsFromUrl("https://jobs.ashbyhq.com/openai/c59e2e83-59a6-45bc-82cd-665c6a8a5761").ats).toBe("ashby");
    expect(detectAtsFromUrl("https://apply.workable.com/acme/j/ABC123/").ats).toBe("workable");
    expect(detectAtsFromUrl("https://acme.wd5.myworkdayjobs.com/en-US/External/job/Role/JR-1").ats).toBe("workday");
    expect(detectAtsFromUrl("https://acme.wd5.myworkdayjobs.com/en-US/External/job/Role/JR-1").submittable).toBe(true);
  });

  it("detects unsupported ATS without claiming submit", () => {
    const icims = detectAtsFromUrl("https://careers-acme.icims.com/jobs/123/job");
    expect(icims.detected).toBe(true);
    expect(icims.ats).toBe("icims");
    expect(icims.submittable).toBe(false);
    expect(icims.mode).toBe("needs_you");

    const workdayLookalike = detectAtsFromUrl("https://myworkdayjobs.com.evil.example/jobs/1");
    expect(workdayLookalike.ats).not.toBe("workday");
  });

  it("marks Indeed and Naukri as account-required, never submittable", () => {
    const indeed = detectAtsFromUrl("https://www.indeed.com/viewjob?jk=abc");
    expect(indeed.ats).toBe("indeed");
    expect(indeed.mode).toBe("account_required");
    expect(indeed.submittable).toBe(false);

    const naukri = detectAtsFromUrl("https://www.naukri.com/job-listings-engineer-acme");
    expect(naukri.ats).toBe("naukri");
    expect(naukri.submittable).toBe(false);
  });

  it("does not treat detection of an unknown host as a live adapter", () => {
    const unknown = detectAtsFromUrl("https://careers.example.com/jobs/senior-engineer");
    expect(unknown.detected).toBe(false);
    expect(unknown.submittable).toBe(false);
    expect(unknown.mode).toBe("unknown");
  });

  it("rejects invalid URLs", () => {
    expect(detectAtsFromUrl("not a url").detected).toBe(false);
    expect(detectAtsFromUrl("javascript:alert(1)").detected).toBe(false);
  });
});
