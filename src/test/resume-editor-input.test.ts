import { describe, expect, it } from "vitest";
import { applySkillCategoryText, mergeResumeSkills } from "@/lib/resume-skills";
import { parseBulletLines } from "@/lib/bullet-lines";

describe("applySkillCategoryText", () => {
  it("keeps a newly added/cleared category present as an empty list", () => {
    const next = applySkillCategoryText({ programming_languages: ["Python"] }, "cloud_platforms", "");
    expect(next.cloud_platforms).toEqual([]);
    expect(next.programming_languages).toEqual(["Python"]);
  });

  it("splits comma-separated text and keeps multi-word skills intact", () => {
    const next = applySkillCategoryText({}, "programming_languages", "Python, Java");
    expect(next.programming_languages).toEqual(expect.arrayContaining(["Python", "Java"]));
  });
});

describe("mergeResumeSkills for imports", () => {
  it("coerces string and array skill values from AI output into string arrays", () => {
    const merged = mergeResumeSkills({}, { programming_languages: "Python, Java" });
    for (const values of Object.values(merged)) {
      expect(Array.isArray(values)).toBe(true);
    }
    expect(Object.values(merged).flat()).toEqual(expect.arrayContaining(["Python", "Java"]));
    expect(() => mergeResumeSkills({}, ["Python", "Docker"])).not.toThrow();
  });
});

describe("parseBulletLines", () => {
  it("drops empty and whitespace-only lines", () => {
    expect(parseBulletLines("Led migration\n\n  \nShipped v2\n")).toEqual(["Led migration", "Shipped v2"]);
  });
});
