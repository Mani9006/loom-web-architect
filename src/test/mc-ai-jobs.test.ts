import { describe, expect, it } from "vitest";
import { defaultModelFor, isJobCancelled, resumeRowToMarkdown } from "@/lib/mc-ai-jobs";

describe("defaultModelFor", () => {
  it("routes heavy synthesis tasks to Sonnet", () => {
    expect(defaultModelFor("tailor")).toBe("sonnet-4-6");
    expect(defaultModelFor("other")).toBe("sonnet-4-6");
  });

  it("routes cheap single-step tasks to Haiku", () => {
    expect(defaultModelFor("score_job")).toBe("haiku-4-5");
    expect(defaultModelFor("classify_email")).toBe("haiku-4-5");
    expect(defaultModelFor("rewrite_line")).toBe("haiku-4-5");
    expect(defaultModelFor("company_research")).toBe("haiku-4-5");
  });

  it("never routes to Opus", () => {
    const kinds = ["tailor", "score_job", "classify_email", "company_research", "rewrite_line", "test", "other"] as const;
    for (const kind of kinds) {
      expect(defaultModelFor(kind)).not.toContain("opus");
    }
  });
});

describe("isJobCancelled", () => {
  it("recognizes the Cancelled rejection produced by an aborted signal", () => {
    expect(isJobCancelled(new Error("Cancelled"))).toBe(true);
  });

  it("does not mistake a real job failure for a cancellation", () => {
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

  it("stitches personal info, summary, experience, and education into markdown", () => {
    const md = resumeRowToMarkdown({
      personal_info: { name: "Jane Doe", email: "jane@example.com", phone: "555-1234" },
      summary: "Senior engineer with 8 years of experience.",
      experience: [
        {
          role: "Senior Engineer",
          company_or_client: "Acme Corp",
          start_date: "2020",
          end_date: "Present",
          bullets: ["Shipped feature X", "Led team of 4"],
        },
      ],
      education: [{ degree: "B.S.", field: "Computer Science", institution: "State University" }],
    });

    expect(md).toContain("# Jane Doe");
    expect(md).toContain("jane@example.com");
    expect(md).toContain("## Summary");
    expect(md).toContain("Senior engineer with 8 years of experience.");
    expect(md).toContain("## Experience");
    expect(md).toContain("**Senior Engineer**, Acme Corp");
    expect(md).toContain("- Shipped feature X");
    expect(md).toContain("## Education");
    expect(md).toContain("**B.S. in Computer Science**, State University");
  });

  it("skips sections that are empty or missing without throwing", () => {
    const md = resumeRowToMarkdown({ personal_info: { name: "No Sections" } });
    expect(md).toBe("# No Sections");
  });

  it("formats skills grouped by category with human-readable labels", () => {
    const md = resumeRowToMarkdown({
      skills: { programming_languages: ["TypeScript", "Python"], cloud: ["AWS"] },
    });
    expect(md).toContain("**Programming Languages:** TypeScript, Python");
    expect(md).toContain("**Cloud:** AWS");
  });
});
