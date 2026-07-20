import { describe, expect, it } from "vitest";
import { jobMatchesSearchIntent } from "@/lib/job-search-relevance";

describe("job search relevance gate", () => {
  it("rejects an unrelated occupation returned by a loose cache search", () => {
    expect(jobMatchesSearchIntent({ title: "Field Marketing Manager", description: "Works with technical teams and data." }, "Data Engineer")).toBe(false);
  });

  it("accepts requested titles and common developer aliases", () => {
    expect(jobMatchesSearchIntent({ title: "Senior Data Engineer" }, "Data Engineer")).toBe(true);
    expect(jobMatchesSearchIntent({ title: "Backend Developer" }, "Backend Engineer")).toBe(true);
  });

  it("keeps generic skill searches useful", () => {
    expect(jobMatchesSearchIntent({ title: "Platform Engineer", description: "Production Kubernetes and Terraform ownership." }, "Kubernetes Terraform")).toBe(true);
  });
});
