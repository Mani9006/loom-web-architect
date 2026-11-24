import { describe, expect, it } from "vitest";
import {
  dedupeCandidates,
  mergeFitScores,
  parseFindJobsInput,
  tierFor,
  usageKindFor,
  type CandidateJob,
} from "../../supabase/functions/_shared/mc-ai-run-core";

const job = (title: string, company: string, url = `https://boards.greenhouse.io/${company}/${title}`): CandidateJob => ({
  title,
  company,
  location: "Remote",
  description: `${title} at ${company}. `.repeat(10),
  apply_url: url,
});

describe("mc-ai-run core", () => {
  it("maps jobs to usage buckets and tiers", () => {
    expect(usageKindFor("tailor")).toBe("tailor");
    expect(usageKindFor("other", "find_jobs")).toBe("search");
    expect(usageKindFor("score_job")).toBe("evaluation");
    expect(tierFor("tailor", "haiku-4-5")).toBe("standard");
    expect(tierFor("other", "sonnet-4-6")).toBe("standard");
    expect(tierFor("rewrite_line", "haiku-4-5")).toBe("lite");
  });

  it("parses find-jobs input defensively", () => {
    expect(parseFindJobsInput(null)).toEqual({ target_roles: [], target_locations: [], remote_only: false });
    expect(
      parseFindJobsInput({ target_roles: [" Data Scientist ", "", 3], target_locations: "NYC", remote_only: "yes" }),
    ).toEqual({ target_roles: ["Data Scientist", "3"], target_locations: [], remote_only: false });
  });

  it("dedupes by url and by title+company", () => {
    const a = job("Engineer", "Stripe");
    const sameUrl = { ...job("Engineer II", "Stripe"), apply_url: a.apply_url };
    const sameTitle = job("engineer", "stripe", "https://other");
    expect(dedupeCandidates([a, sameUrl, sameTitle, job("PM", "Stripe")]).map((j) => j.title)).toEqual([
      "Engineer",
      "PM",
    ]);
  });

  it("sorts by fit, drops irrelevant, keeps unscored listings", () => {
    const jobs = [job("A", "X"), job("B", "X"), job("C", "X"), job("D", "X")];
    const out = mergeFitScores(jobs, [
      { i: 0, fit_score: 1 },
      { i: 1, fit_score: 0 },
      { i: 2, fit_score: 3, fit_reason: "Strong", summary: "Role C" },
    ]);
    expect(out.map((j) => j.title)).toEqual(["C", "D", "A"]);
    expect(out[0]).toMatchObject({ fit_score: 3, fit_reason: "Strong", summary: "Role C" });
    expect(out[1].fit_score).toBeUndefined();
    expect(out[1].summary).toBeTruthy();
    expect(out[1].description).toContain("D at X");
  });

  it("keeps every listing when scoring failed", () => {
    expect(mergeFitScores([job("A", "X"), job("B", "Y")], null)).toHaveLength(2);
  });
});

import { filterByLocations } from "../../supabase/functions/_shared/mc-ai-run-core";

describe("filterByLocations", () => {
  const jobs = [
    { location: "New York, NY" },
    { location: "Remote (US)" },
    { location: "San Francisco, CA" },
    { location: "" },
  ];
  it("passes everything with no targets or remote-only", () => {
    expect(filterByLocations(jobs, [], false)).toHaveLength(4);
    expect(filterByLocations(jobs, ["Austin"], true)).toHaveLength(4);
  });
  it("keeps matching and remote listings", () => {
    expect(filterByLocations(jobs, ["new york"], false).map((j) => j.location)).toEqual([
      "New York, NY",
      "Remote (US)",
      "",
    ]);
  });
});
