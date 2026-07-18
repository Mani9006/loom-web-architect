import { describe, expect, it } from "vitest";

import { cleanJobDescription, jobDescriptionPreview, safeMatchText } from "@/lib/job-description";

describe("job description normalization", () => {
  it("deduplicates repeated source intros and structures inline bullets", () => {
    const intro = "Reddit is a community of communities. It is built on shared interests and trust.";
    const result = cleanJobDescription(`${intro} ${intro} Responsibilities • Build reliable metrics • Partner with product teams`);

    expect(result.match(/Reddit is a community of communities/g)).toHaveLength(1);
    expect(result).toContain("Responsibilities\n• Build reliable metrics\n• Partner with product teams");
  });

  it("creates a bounded card preview at a word boundary", () => {
    const source = Array.from({ length: 20 }, (_, index) => `Build trusted system ${index} with product and engineering teams.`).join(" ");
    const result = jobDescriptionPreview(source, 120);
    expect(result.length).toBeLessThanOrEqual(121);
    expect(result).toMatch(/…$/);
  });

  it("keeps internal preference terminology out of match copy", () => {
    expect(safeMatchText("Blocked by a hard preference: salary missing")).toBe("Needs a preference review: salary missing");
  });
});
