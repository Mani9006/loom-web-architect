import { describe, expect, it } from "vitest";
import { defaultModelFor, isJobCancelled, resumeRowToMarkdown } from "@/lib/mc-ai-jobs";

describe("defaultModelFor", () => {
  it("picks sonnet for full-document tailoring", () => {
    expect(defaultModelFor("tailor")).toBe("sonnet-4-6");
  });

  it("picks haiku for cheap single-shot tasks", () => {
    expect(defaultModelFor("score_job")).toBe("haiku-4-5");
    expect(defaultModelFor("classify_email")).toBe("haiku-4-5");
    expect(defaultModelFor("rewrite_line")).toBe("haiku-4-5");
    expect(defaultModelFor("company_research")).toBe("haiku-4-5");
  });

  it("assumes non-trivial work for the catchall kind", () => {
    expect(defaultModelFor("other")).toBe("sonnet-4-6");
  });
});

describe("isJobCancelled", () => {
  it("is true only for the exact Cancelled error message", () => {
    expect(isJobCancelled(new Error("Cancelled"))).toBe(true);
  });

  it("is false for other errors, non-Error values, and near-miss messages", () => {
    expect(isJobCancelled(new Error("Job failed"))).toBe(false);
    expect(isJobCancelled(new Error("cancelled"))).toBe(false);
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

  it("returns an empty string for a row with no populated sections", () => {
    expect(resumeRowToMarkdown({})).toBe("");
  });

  it("renders the header and contact line from personal_info", () => {
    const md = resumeRowToMarkdown({
      personal_info: { name: "Ada Lovelace", email: "ada@example.com", phone: "555-1234" },
    });
    expect(md).toContain("# Ada Lovelace");
    expect(md).toContain("ada@example.com · 555-1234");
  });

  it("omits the contact line entirely when no contact fields are present", () => {
    const md = resumeRowToMarkdown({ personal_info: { name: "Ada Lovelace" } });
    expect(md).toBe("# Ada Lovelace");
  });

  it("renders experience entries with dates, location, and bullets", () => {
    const md = resumeRowToMarkdown({
      experience: [
        {
          role: "Senior Engineer",
          company_or_client: "Acme Corp",
          start_date: "2020",
          end_date: "2023",
          location: "Remote",
          bullets: ["Shipped the thing", "Led the team"],
        },
      ],
    });
    expect(md).toContain("## Experience");
    expect(md).toContain("**Senior Engineer**, Acme Corp");
    expect(md).toContain("2020 – 2023 · Remote");
    expect(md).toContain("- Shipped the thing");
    expect(md).toContain("- Led the team");
  });

  it("skips the Experience section when the array is empty", () => {
    expect(resumeRowToMarkdown({ experience: [] })).toBe("");
  });

  it("renders skills grouped by category with humanized labels", () => {
    const md = resumeRowToMarkdown({
      skills: { programming_languages: ["TypeScript", "Python"], tools: "Git" },
    });
    expect(md).toContain("## Skills");
    expect(md).toContain("**Programming Languages:** TypeScript, Python");
    expect(md).toContain("**Tools:** Git");
  });

  it("renders education, projects, certifications, and languages sections", () => {
    const md = resumeRowToMarkdown({
      education: [{ degree: "BS", field: "Computer Science", institution: "MIT", graduation_date: "2019" }],
      projects: [{ title: "Widget", organization: "Side project", date: "2021", bullets: ["Built it"] }],
      certifications: [{ name: "AWS SAA", issuer: "Amazon", date: "2022" }],
      languages: [{ language: "Spanish", proficiency: "Conversational" }],
    });
    expect(md).toContain("## Education");
    expect(md).toContain("**BS in Computer Science**, MIT");
    expect(md).toContain("## Projects");
    expect(md).toContain("**Widget**, Side project (2021)");
    expect(md).toContain("- Built it");
    expect(md).toContain("## Certifications");
    expect(md).toContain("- AWS SAA, Amazon (2022)");
    expect(md).toContain("## Languages");
    expect(md).toContain("- Spanish (Conversational)");
  });

  it("stitches a full resume into sections separated by blank lines", () => {
    const md = resumeRowToMarkdown({
      personal_info: { name: "Ada Lovelace" },
      summary: "  Builds things.  ",
      experience: [{ role: "Engineer", bullets: ["Did stuff"] }],
    });
    expect(md).toBe(
      ["# Ada Lovelace", "## Summary", "Builds things.", "## Experience", "**Engineer**", "- Did stuff"].join(
        "\n\n",
      ),
    );
  });
});
