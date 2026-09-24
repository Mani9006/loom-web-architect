import { describe, expect, it } from "vitest";
import { defaultModelFor, isJobCancelled, resumeRowToMarkdown } from "@/lib/mc-ai-jobs";

describe("My Collection AI job queue helpers", () => {
  describe("defaultModelFor", () => {
    it("routes the full-document tailor pipeline to Sonnet", () => {
      expect(defaultModelFor("tailor")).toBe("sonnet-4-6");
    });

    it("routes cheap single-shot tasks to Haiku", () => {
      expect(defaultModelFor("score_job")).toBe("haiku-4-5");
      expect(defaultModelFor("classify_email")).toBe("haiku-4-5");
      expect(defaultModelFor("rewrite_line")).toBe("haiku-4-5");
      expect(defaultModelFor("company_research")).toBe("haiku-4-5");
    });

    it("defaults an unmapped kind to Haiku rather than throwing", () => {
      expect(defaultModelFor("does_not_exist" as never)).toBe("haiku-4-5");
    });
  });

  describe("isJobCancelled", () => {
    it("recognizes the Cancelled sentinel error", () => {
      expect(isJobCancelled(new Error("Cancelled"))).toBe(true);
    });

    it("does not mistake a real failure for a cancellation", () => {
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

    it("stitches a full resume row into markdown sections in order", () => {
      const md = resumeRowToMarkdown({
        personal_info: { name: "Jordan Lee", email: "jordan@example.com", phone: "555-0100", location: "Remote" },
        summary: "Senior engineer focused on distributed systems.",
        experience: [
          {
            role: "Staff Engineer",
            company_or_client: "Acme Corp",
            start_date: "2022",
            end_date: "Present",
            location: "Remote",
            bullets: ["Led migration to Kubernetes", "Cut latency by 40%"],
          },
        ],
        education: [
          { degree: "B.S.", field: "Computer Science", institution: "State University", graduation_date: "2018" },
        ],
        skills: { programming_languages: ["TypeScript", "Go"] },
        projects: [{ title: "Open Source CLI", organization: "Personal", date: "2023", bullets: ["10k stars on GitHub"] }],
        certifications: [{ name: "AWS Solutions Architect", issuer: "AWS", date: "2021" }],
        languages: [{ language: "Spanish", proficiency: "Conversational" }],
      });

      expect(md).toContain("# Jordan Lee");
      expect(md).toContain("jordan@example.com");
      expect(md).toContain("## Summary");
      expect(md).toContain("## Experience");
      expect(md).toContain("**Staff Engineer**, Acme Corp");
      expect(md).toContain("- Led migration to Kubernetes");
      expect(md).toContain("## Education");
      expect(md).toContain("**B.S. in Computer Science**, State University");
      expect(md).toContain("## Skills");
      expect(md).toContain("**Programming Languages:** TypeScript, Go");
      expect(md).toContain("## Projects");
      expect(md).toContain("## Certifications");
      expect(md).toContain("## Languages");

      // Sections should appear in this relative order.
      const order = ["## Summary", "## Experience", "## Education", "## Skills", "## Projects", "## Certifications", "## Languages"];
      const positions = order.map((h) => md.indexOf(h));
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]).toBeGreaterThan(positions[i - 1]);
      }
    });

    it("omits empty sections instead of emitting empty headings", () => {
      const md = resumeRowToMarkdown({
        personal_info: { name: "Sam Rivera" },
        summary: "",
        experience: [],
        education: [],
        skills: {},
        projects: [],
        certifications: [],
        languages: [],
      });

      expect(md).toBe("# Sam Rivera");
    });

    it("skips a skills category whose value list is empty", () => {
      const md = resumeRowToMarkdown({
        skills: { programming_languages: [], cloud_devops: ["AWS"] },
      });

      expect(md).toContain("**Cloud Devops:** AWS");
      expect(md).not.toContain("Programming Languages");
    });
  });
});
