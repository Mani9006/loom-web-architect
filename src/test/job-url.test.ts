import { describe, expect, it } from "vitest";
import {
  buildGoogleJobSearch,
  buildLinkedInFallback,
  isDirectJobLink,
  isGenericCareerPage,
  looksLikelyBrokenUrl,
  resolveJobUrl,
  safeHttpUrl,
} from "@/lib/job-url";

describe("job-url utilities", () => {
  describe("looksLikelyBrokenUrl", () => {
    it.each([
      null,
      undefined,
      "",
      "javascript:alert(1)",
      "data:text/html,<b>x</b>",
      "ftp://jobs.example.com/123",
      "https://example.com/job",
      "https://placeholder.local/job",
      "https://jobs.example.com/undefined",
      "http://x.co",
    ])("flags broken or placeholder URL %j", (url) => {
      expect(looksLikelyBrokenUrl(url)).toBe(true);
    });

    it("allows plausible HTTP URLs", () => {
      expect(looksLikelyBrokenUrl("https://company.com/jobs/software-engineer-123")).toBe(false);
    });
  });

  describe("direct and generic job URL detection", () => {
    it.each([
      "https://www.linkedin.com/jobs/view/123456789",
      "https://www.indeed.com/viewjob?jk=abc123",
      "https://boards.greenhouse.io/acme/jobs/123456",
      "https://jobs.lever.co/acme/550e8400-e29b-41d4-a716-446655440000",
      "https://acme.myworkdayjobs.com/en-US/jobs/job/software-engineer",
      "https://jobs.ashbyhq.com/acme/550e8400-e29b-41d4-a716-446655440000",
      "https://apply.workable.com/acme/j/ABCDEF1234/",
    ])("recognizes direct ATS link %s", (url) => {
      expect(isDirectJobLink(url)).toBe(true);
    });

    it.each([
      "https://company.com/careers",
      "https://company.com/careers/search?q=engineer",
      "https://company.com/jobs",
      "https://www.linkedin.com/jobs/search/?keywords=engineer",
      "https://www.indeed.com/jobs?q=engineer",
      "https://www.monster.com/jobs/search?q=engineer",
    ])("recognizes generic search or career page %s", (url) => {
      expect(isGenericCareerPage(url)).toBe(true);
    });

    it("does not classify unknown deep company pages as generic", () => {
      expect(isGenericCareerPage("https://company.com/openings/software-engineer-123")).toBe(false);
      expect(isDirectJobLink("https://company.com/openings/software-engineer-123")).toBe(false);
    });
  });

  describe("fallback builders", () => {
    it("builds encoded LinkedIn fallback URLs with default location", () => {
      expect(buildLinkedInFallback("Senior AI Engineer", "Acme Labs")).toBe(
        "https://www.linkedin.com/jobs/search/?keywords=Senior%20AI%20Engineer%20Acme%20Labs&location=United%20States",
      );
    });

    it("builds encoded LinkedIn fallback URLs with explicit location", () => {
      expect(buildLinkedInFallback("Data Scientist", "A&B Co", "New York, NY")).toBe(
        "https://www.linkedin.com/jobs/search/?keywords=Data%20Scientist%20A%26B%20Co&location=New%20York%2C%20NY",
      );
    });

    it("builds encoded Google job search URLs", () => {
      expect(buildGoogleJobSearch("Frontend Engineer", "Acme")).toBe(
        "https://www.google.com/search?q=Frontend%20Engineer%20Acme%20apply",
      );
    });
  });

  describe("resolveJobUrl", () => {
    it("falls back to LinkedIn when apply URL is missing or broken", () => {
      expect(resolveJobUrl(null, "Backend Engineer", "Acme", "Remote")).toEqual({
        url: "https://www.linkedin.com/jobs/search/?keywords=Backend%20Engineer%20Acme&location=Remote",
        isFallback: true,
        label: "Search on LinkedIn",
      });
    });

    it("uses known direct job links as-is", () => {
      const url = "https://www.linkedin.com/jobs/view/123456789";
      expect(resolveJobUrl(url, "Backend Engineer", "Acme")).toEqual({
        url,
        isFallback: false,
        label: "Apply",
      });
    });

    it("falls back for generic career pages", () => {
      expect(resolveJobUrl("https://company.com/careers", "Designer", "Studio", "Austin, TX")).toEqual({
        url: "https://www.linkedin.com/jobs/search/?keywords=Designer%20Studio&location=Austin%2C%20TX",
        isFallback: true,
        label: "Search on LinkedIn",
      });
    });

    it("trusts unknown but plausible deep links", () => {
      const url = "https://company.com/openings/backend-engineer-2026";
      expect(resolveJobUrl(url, "Backend Engineer", "Acme")).toEqual({
        url,
        isFallback: false,
        label: "Apply",
      });
    });
  });

  describe("safeHttpUrl", () => {
    it.each(["https://jobs.example.org/123", "http://acme.com/careers/42", "  https://a.io/x  "])(
      "accepts http(s) URL %s",
      (url) => {
        expect(safeHttpUrl(url)).toBe(url.trim());
      },
    );

    it.each([
      null,
      undefined,
      "",
      "javascript:alert(1)",
      "JavaScript:fetch('//evil')",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
      "/relative/path",
      "not a url",
    ])("rejects %s", (url) => {
      expect(safeHttpUrl(url)).toBeUndefined();
    });
  });
});
