import { describe, expect, it } from "vitest";
import { looksLikeUsLocation, sponsorshipDefault } from "@/lib/us-geo";
import { pipelineFromCsv, pipelineToCsv, normalizePipelineStatus } from "@/lib/pipeline";
import { effectiveRecipeFloor, recipeMatchesTitle } from "@/lib/search-recipes";

describe("US geo defaults", () => {
  it("treats empty, remote, and US states as US", () => {
    expect(looksLikeUsLocation(null)).toBe(true);
    expect(looksLikeUsLocation("Remote, USA")).toBe(true);
    expect(looksLikeUsLocation("Austin, TX")).toBe(true);
    expect(looksLikeUsLocation("Bengaluru, India")).toBe(false);
  });

  it("defaults sponsorship from US work authorization", () => {
    expect(sponsorshipDefault("US citizen")).toBe("no");
    expect(sponsorshipDefault("H-1B")).toBe("yes");
    expect(sponsorshipDefault("F-1")).toBe("yes");
  });
});

describe("pipeline csv", () => {
  it("round-trips cards and maps Saved to Applied", () => {
    expect(normalizePipelineStatus("Saved")).toBe("Applied");
    const csv = pipelineToCsv([{
      id: "1", title: "Eng", company: "Acme", status: "Applied", url: "https://x", notes: "hi, there", updated_at: "2026-01-01",
    }]);
    const parsed = pipelineFromCsv(csv);
    expect(parsed[0]).toMatchObject({ title: "Eng", company: "Acme", status: "Applied", notes: "hi, there" });
  });
});

describe("search recipes", () => {
  it("uses the lowest enabled floor so recipes share one daily cap", () => {
    expect(effectiveRecipeFloor([
      { id: "a", name: "A", enabled: true, target_roles: ["PM"], locations: ["United States"], min_fit_score: 90, exclude_keywords: [], sort_order: 0 },
      { id: "b", name: "B", enabled: true, target_roles: ["Eng"], locations: ["United States"], min_fit_score: 75, exclude_keywords: [], sort_order: 1 },
      { id: "c", name: "C", enabled: false, target_roles: [], locations: [], min_fit_score: 50, exclude_keywords: [], sort_order: 2 },
    ], 82)).toBe(75);
  });

  it("matches titles against recipe roles", () => {
    const recipe = {
      id: "a", name: "A", enabled: true, target_roles: ["Product Manager"], locations: ["United States"],
      min_fit_score: 80, exclude_keywords: [], sort_order: 0,
    };
    expect(recipeMatchesTitle(recipe, "Senior Product Manager", "NY")).toBe(true);
    expect(recipeMatchesTitle(recipe, "Staff Engineer", "NY")).toBe(false);
  });
});
