import { describe, expect, it } from "vitest";
import { defaultModelFor, isJobCancelled, resumeRowToMarkdown } from "@/lib/mc-ai-jobs";

describe("mc-ai-jobs utilities", () => {
  describe("defaultModelFor", () => {
    it("routes heavy synthesis to sonnet", () => {
      expect(defaultModelFor("tailor")).toBe("sonnet-4-6");
      expect(defaultModelFor("other")).toBe("sonnet-4-6");
    });

    it("routes cheap single-step tasks to haiku", () => {
      expect(defaultModelFor("score_job")).toBe("haiku-4-5");
      expect(defaultModelFor("classify_email")).toBe("haiku-4-5");
      expect(defaultModelFor("rewrite_line")).toBe("haiku-4-5");
      expect(defaultModelFor("company_research")).toBe("haiku-4-5");
      expect(defaultModelFor("test")).toBe("haiku-4-5");
    });
  });

  describe("isJobCancelled", () => {
    it("recognizes the Cancelled error thrown on abort", () => {
      expect(isJobCancelled(new Error("Cancelled"))).toBe(true);
    });

    it("does not treat other errors as a cancellation", () => {
      expect(isJobCancelled(new Error("Job failed"))).toBe(false);
      expect(isJobCancelled("Cancelled")).toBe(false);
      expect(isJobCancelled(null)).toBe(false);
      expect(isJobCancelled(undefined)).toBe(false);
    });
  });

  describe("resumeRowToMarkdown", () => {
    it("returns an empty string for a missing row", () => {
      expect(resumeRowToMarkdown(null)).toBe("");
      expect(resumeRowToMarkdown(undefined)).toBe("");
    });

    it("renders header, summary, experience, education, skills, projects, certifications, and languages", () => {
      const md = resumeRowToMarkdown({
        personal_info: { name: "Jamie Rivera", email: "jamie@example.com", phone: "555-0100", location: "Remote" },
        summary: "  Senior engineer with a decade of full-stack experience.  ",
        experience: [
          {
            role: "Staff Engineer",
            company_or_client: "Acme Corp",
            start_date: "2021",
            end_date: "Present",
            location: "Remote",
            bullets: ["Led the platform migration", "Mentored five engineers"],
          },
        ],
        education: [
          { degree: "B.S.", field: "Computer Science", institution: "State University", graduation_date: "2015", gpa: "3.8" },
        ],
        skills: { programming_languages: ["TypeScript", "Go"], cloud: ["AWS"] },
        projects: [{ title: "Open Source CLI", organization: "Personal", date: "2023", bullets: ["10k+ downloads"] }],
        certifications: [{ name: "AWS Solutions Architect", issuer: "Amazon", date: "2022" }],
        languages: [{ language: "Spanish", proficiency: "Fluent" }],
      });

      expect(md).toContain("# Jamie Rivera");
      expect(md).toContain("jamie@example.com · 555-0100 · Remote");
      expect(md).toContain("## Summary");
      expect(md).toContain("Senior engineer with a decade of full-stack experience.");
      expect(md).toContain("## Experience");
      expect(md).toContain("**Staff Engineer**, Acme Corp");
      expect(md).toContain("- Led the platform migration");
      expect(md).toContain("## Education");
      expect(md).toContain("**B.S. in Computer Science**, State University");
      expect(md).toContain("## Skills");
      expect(md).toContain("**Programming Languages:** TypeScript, Go");
      expect(md).toContain("## Projects");
      expect(md).toContain("**Open Source CLI**, Personal (2023)");
      expect(md).toContain("## Certifications");
      expect(md).toContain("- AWS Solutions Architect, Amazon (2022)");
      expect(md).toContain("## Languages");
      expect(md).toContain("- Spanish (Fluent)");
    });

    it("omits empty sections instead of rendering blank headings", () => {
      const md = resumeRowToMarkdown({ personal_info: { name: "Alex" } });
      expect(md).toBe("# Alex");
      expect(md).not.toContain("## Experience");
      expect(md).not.toContain("## Education");
      expect(md).not.toContain("## Skills");
    });
  });
});
