import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  calculateResumeParseQuality,
  extractExperienceFixEntries,
  formatBullets,
  mapParsedToResumePayload,
  mergeAndDeduplicateSkills,
  normalizeAndDeduplicateSkills,
  parseAIResponse,
  prepareResumeTextForParsing,
} from "@/lib/ai-resume-parser";

describe("ai-resume-parser utilities", () => {
  describe("parseAIResponse", () => {
    it("extracts JSON from markdown fences", () => {
      expect(parseAIResponse('```json\n{"summary":"Ready","skills":{"NLP Tools":["spaCy"]}}\n```')).toEqual({
        summary: "Ready",
        skills: { "NLP Tools": ["spaCy"] },
      });
    });

    it("extracts the first balanced JSON object from surrounding prose", () => {
      expect(
        parseAIResponse('Here is the parsed resume: {"summary":"Built {safe} systems","count":2} Thanks!'),
      ).toEqual({ summary: "Built {safe} systems", count: 2 });
    });

    it("cleans trailing commas and control characters before parsing", () => {
      expect(parseAIResponse('{"summary":"ok"\u0000,"skills":["TypeScript",],}')).toEqual({
        summary: "ok",
        skills: ["TypeScript"],
      });
    });

    it("repairs simple truncated JSON responses", () => {
      expect(parseAIResponse('{"header":{"name":"Ada"},"experience":[{"role":"Engineer"}')).toEqual({
        header: { name: "Ada" },
        experience: [{ role: "Engineer" }],
      });
    });

    it("returns null for empty or malformed content", () => {
      expect(parseAIResponse("")).toBeNull();
      expect(parseAIResponse("no structured data here")).toBeNull();
    });
  });

  describe("extractExperienceFixEntries", () => {
    it("accepts the object shape requested by the experience-fix prompt", () => {
      const parsed = parseAIResponse('{"experience":[{"role":"Engineer","bullets":["Improved latency"]}]}');

      expect(extractExperienceFixEntries(parsed)).toEqual([
        { role: "Engineer", bullets: ["Improved latency"] },
      ]);
    });

    it("rejects responses without an experience array", () => {
      expect(extractExperienceFixEntries({ summary: "No experience payload" })).toBeNull();
    });
  });

  describe("formatBullets", () => {
    it("normalizes array bullets and removes empty values", () => {
      expect(formatBullets([" • Led migration ", "", "- Improved latency", "* Reduced cost"])).toEqual([
        "Led migration",
        "Improved latency",
        "Reduced cost",
      ]);
    });

    it("splits multiline and bullet-prefixed strings", () => {
      expect(formatBullets("• Built APIs\n- Wrote tests\n* Mentored team")).toEqual([
        "Built APIs",
        "Wrote tests",
        "Mentored team",
      ]);
    });

    it("returns an empty array for empty values", () => {
      expect(formatBullets("")).toEqual([]);
    });
  });

  describe("prepareResumeTextForParsing", () => {
    it("preserves the complete project QA resume fixture", () => {
      const fixture = readFileSync("qa/fixtures/sample-resume.txt", "utf8");
      const prepared = prepareResumeTextForParsing(fixture);

      expect(prepared).toContain("SUMMARY");
      expect(prepared).toContain("EXPERIENCE");
      expect(prepared).toContain("SKILLS");
      expect(prepared).toContain("EDUCATION");
      expect(prepared).toContain("Reduced API response time by 38%");
      expect(prepared).not.toContain("[Content truncated for processing]");
    });

    it("trims short resume text without truncating", () => {
      expect(prepareResumeTextForParsing("  Summary\n\nExperience  ")).toBe("Summary\n\nExperience");
    });

    it("truncates long resume text and appends a processing marker", () => {
      const longText = `${"a".repeat(47_000)}\n\nExperience\n${"b".repeat(2_000)}`;
      const prepared = prepareResumeTextForParsing(longText);

      expect(prepared.length).toBeLessThan(longText.length);
      expect(prepared).toContain("[Content truncated for processing]");

      const quality = calculateResumeParseQuality(prepared, {
        header: {},
        summary: prepared,
        experience: [],
        education: [],
        certifications: [],
        skills: {},
        projects: [],
      });
      expect(quality.truncated).toBe(true);
      expect(quality.status).toBe("review_required");
      expect(quality.warnings.join(" ")).toMatch(/parser limit|manual review/i);
    });
  });

  describe("skill normalization", () => {
    it("normalizes aliased categories and deduplicates skills case-insensitively", () => {
      expect(
        normalizeAndDeduplicateSkills({
          "NLP Tools": ["spaCy", "BERT"],
          nlp_technologies: ["spacy", "Transformers"],
          "Cloud Platforms": ["AWS", "GCP"],
          cloud_mlops: ["aws", "Kubernetes"],
        }),
      ).toEqual({
        ai_ml: ["spaCy", "BERT", "Transformers"],
        cloud_devops: ["AWS", "GCP", "Kubernetes"],
      });
    });

    it("merges existing and incoming skills without losing existing ordering", () => {
      expect(
        mergeAndDeduplicateSkills(
          { programming_languages: ["TypeScript", "Python"], ml_frameworks: ["PyTorch"] },
          { languages: ["typescript", "Go"], machine_learning: ["pytorch", "scikit-learn"] },
        ),
      ).toEqual({
        programming_languages: ["TypeScript", "Python", "Go"],
        ai_ml: ["PyTorch", "scikit-learn"],
      });
    });
  });

  describe("mapParsedToResumePayload", () => {
    beforeEach(() => {
      vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
    });

    it("maps parsed AI JSON into the stored resume payload shape", () => {
      expect(
        mapParsedToResumePayload({
          header: {
            name: "Ada Lovelace",
            title: "Computing Pioneer",
            email: "ada@example.com",
            phone: "555-0100",
            location: "London",
            linkedin: "linkedin.com/in/ada",
          },
          summary: "Built analytical engines.",
          experience: [
            {
              role: "Engineer",
              company_or_client: "Analytical Engines Ltd",
              start_date: "Jan 1843",
              end_date: "Present",
              location: "London",
              bullets: "• Designed algorithms\n- Documented systems",
            },
          ],
          education: [{ degree: "BS", field: "Math", institution: "University", graduation_date: "1842" }],
          certifications: [{ name: "AI", issuer: "Academy", date: "1843" }],
          skills: { "NLP Tools": ["BERT", "bert"], "Cloud Platforms": ["AWS"] },
          projects: [{ title: "Notes", organization: "Royal Society", date: "1843", bullets: ["Translated paper"] }],
        }),
      ).toEqual({
        personal_info: {
          name: "Ada Lovelace",
          title: "Computing Pioneer",
          email: "ada@example.com",
          phone: "555-0100",
          location: "London",
          linkedin: "linkedin.com/in/ada",
        },
        summary: "Built analytical engines.",
        experience: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            role: "Engineer",
            company_or_client: "Analytical Engines Ltd",
            start_date: "Jan 1843",
            end_date: "Present",
            location: "London",
            bullets: ["Designed algorithms", "Documented systems"],
            environment: "",
          },
        ],
        education: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            degree: "BS",
            field: "Math",
            institution: "University",
            gpa: "",
            graduation_date: "1842",
            location: "",
            start_date: "",
            end_date: "",
          },
        ],
        certifications: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            name: "AI",
            issuer: "Academy",
            date: "1843",
            url: "",
          },
        ],
        skills: {
          ai_ml: ["BERT"],
          cloud_devops: ["AWS"],
        },
        projects: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            title: "Notes",
            organization: "Royal Society",
            date: "1843",
            bullets: ["Translated paper"],
            url: "",
          },
        ],
        languages: [],
        volunteer: [],
        awards: [],
        custom_sections: [],
      });
    });
  });

  describe("source coverage quality gate", () => {
    it("passes a lossless structured extraction and counts private-use bullet glyphs", () => {
      const source = `PROFESSIONAL SUMMARY
Data scientist building reliable systems.
PROFESSIONAL EXPERIENCE
Acme | Jan 2022 - Present
Data Scientist
\uF0B7 Built a Python scoring service for production workflows.
\uF0B7 Reduced model latency by 35 percent through batching.
Environment: Python, SQL, AWS
EDUCATION
M.S. Analytics | Jan 2020 - May 2022
Example University`;
      const parsed = {
        header: { name: "", title: "", location: "", email: "", phone: "", linkedin: "" },
        summary: "Data scientist building reliable systems.",
        experience: [{
          company_or_client: "Acme", role: "Data Scientist", start_date: "Jan 2022", end_date: "Present",
          location: "", bullets: [
            "Built a Python scoring service for production workflows.",
            "Reduced model latency by 35 percent through batching.",
          ], environment: "Python, SQL, AWS",
        }],
        education: [{
          degree: "M.S.", field: "Analytics", institution: "Example University", gpa: "",
          start_date: "Jan 2020", end_date: "May 2022", graduation_date: "May 2022", location: "",
        }],
        certifications: [], skills: {}, projects: [], languages: [], volunteer: [], awards: [], custom_sections: [],
      };
      const quality = calculateResumeParseQuality(source, parsed);
      expect(quality.evidence.sourceBullets).toBe(2);
      expect(quality.metrics.bulletCoverage).toBe(100);
      expect(quality.status).toBe("passed");
    });

    it("requires review when bullets and dates disappear", () => {
      const source = "EXPERIENCE\nAcme Jan 2020 - May 2023\n\uF0B7 Built Python APIs\n\uF0B7 Improved reliability";
      const quality = calculateResumeParseQuality(source, {
        header: {}, summary: "", experience: [{ company_or_client: "Acme", bullets: [] }],
        education: [], certifications: [], skills: {}, projects: [],
      });
      expect(quality.status).toBe("review_required");
      expect(quality.warnings.join(" ")).toMatch(/bullet|date/i);
    });
  });
});
