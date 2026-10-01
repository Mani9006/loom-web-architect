import { describe, expect, it } from "vitest";
import { isManualIntakeIdentifier } from "../../supabase/functions/_shared/auto-submit-portal";
import {
  DETERMINISTIC_FIT_MODEL,
  withoutPreservedEvaluations,
} from "../../supabase/functions/_shared/match-feed-preserve";

describe("isManualIntakeIdentifier", () => {
  // Regression: one-click intake stores Workday/iCIMS postings as api_type
  // "lever" with a manual identifier; the Agent must not auto-submit them.
  it("flags one-click manual intake companies", () => {
    expect(isManualIntakeIdentifier("manual")).toBe(true);
    expect(isManualIntakeIdentifier("manual-intake-acme-1234abcd")).toBe(true);
  });

  it("keeps real portal identifiers submittable", () => {
    expect(isManualIntakeIdentifier("acme")).toBe(false);
    expect(isManualIntakeIdentifier("unknown")).toBe(false);
    expect(isManualIntakeIdentifier(null)).toBe(false);
    expect(isManualIntakeIdentifier(undefined)).toBe(false);
  });
});

describe("withoutPreservedEvaluations", () => {
  const rows = [
    { scanned_job_id: "new" },
    { scanned_job_id: "deterministic" },
    { scanned_job_id: "ai" },
    { scanned_job_id: "dismissed" },
  ];

  // Regression: the match-feed upsert overwrote paid AI evaluations and
  // un-dismissed "Passed" jobs.
  it("only refreshes fresh or undismissed deterministic rows", () => {
    const kept = withoutPreservedEvaluations(rows, [
      { scanned_job_id: "deterministic", model: DETERMINISTIC_FIT_MODEL, dismissed_at: null },
      { scanned_job_id: "ai", model: "claude-sonnet", dismissed_at: null },
      { scanned_job_id: "dismissed", model: DETERMINISTIC_FIT_MODEL, dismissed_at: "2026-09-01T00:00:00Z" },
    ]);
    expect(kept.map((row) => row.scanned_job_id)).toEqual(["new", "deterministic"]);
  });

  it("keeps every row when nothing exists yet", () => {
    expect(withoutPreservedEvaluations(rows, [])).toEqual(rows);
  });
});
