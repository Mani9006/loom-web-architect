import { describe, expect, it } from "vitest";

import {
  getResumeReviewState,
  isResumeAllowedForAutomation,
  requireResumeAllowedForAutomation,
  RESUME_REVIEW_REQUIRED_MESSAGE,
  withResumeReviewConfirmation,
} from "../../supabase/functions/_shared/resume-review";

const SOURCE_HASH = "d34db33f";

function row(parseQuality: Record<string, unknown> | null, sourceHash = SOURCE_HASH) {
  return {
    id: "resume-1",
    source_hash: sourceHash,
    parse_quality: parseQuality,
  };
}

function quality(status: "passed" | "review_required" = "passed") {
  return {
    version: "lossless-v1",
    status,
    score: status === "passed" ? 99 : 72,
    warnings: [],
  };
}

describe("resume import review quarantine", () => {
  it("allows a provenance-free scratch resume and a verified import", () => {
    expect(isResumeAllowedForAutomation(row(null, ""))).toBe(true);
    expect(isResumeAllowedForAutomation(row(quality("passed")))).toBe(true);
  });

  it("fails closed when imported provenance is incomplete or unrecognized", () => {
    expect(isResumeAllowedForAutomation(row(null))).toBe(false);
    expect(isResumeAllowedForAutomation(row(quality("passed"), ""))).toBe(false);
    expect(isResumeAllowedForAutomation(row({
      ...quality("passed"),
      status: "unknown_parser_state",
    }))).toBe(false);
  });

  it("blocks a low-confidence import before profile, matching, tailoring, or submission", () => {
    const resume = row(quality("review_required"));
    expect(getResumeReviewState(resume)).toMatchObject({
      requiresReview: true,
      confirmed: false,
      allowed: false,
      reason: "low_confidence",
    });
    expect(() => requireResumeAllowedForAutomation(resume))
      .toThrow(RESUME_REVIEW_REQUIRED_MESSAGE);
  });

  it("blocks a truncated import even when a historical row says it passed", () => {
    const resume = row({
      ...quality("passed"),
      warnings: ["The source exceeded the parser limit and requires manual review."],
    });
    expect(getResumeReviewState(resume)).toMatchObject({
      requiresReview: true,
      allowed: false,
      reason: "truncated",
    });
  });

  it("allows a quarantined import after explicit confirmation for the same source hash", () => {
    const parseQuality = withResumeReviewConfirmation(
      quality("review_required"),
      SOURCE_HASH,
      "2026-07-24T20:00:00.000Z",
    );
    expect(getResumeReviewState(row(parseQuality))).toEqual({
      requiresReview: true,
      confirmed: true,
      allowed: true,
      reason: null,
    });
  });

  it("invalidates a confirmation copied from a different source", () => {
    const parseQuality = withResumeReviewConfirmation(
      quality("review_required"),
      "old-source-hash",
      "2026-07-24T20:00:00.000Z",
    );
    expect(getResumeReviewState(row(parseQuality))).toMatchObject({
      requiresReview: true,
      confirmed: false,
      allowed: false,
      reason: "confirmation_mismatch",
    });
  });

  it("rejects malformed confirmation timestamps", () => {
    expect(() => withResumeReviewConfirmation(
      quality("review_required"),
      SOURCE_HASH,
      "not-a-date",
    )).toThrow(/valid ISO timestamp/i);
  });

  it("does not accept a timestamp alone as an explicit user review", () => {
    const resume = row({
      ...quality("review_required"),
      review_confirmation: {
        confirmed_at: "2026-07-24T20:00:00.000Z",
        source_hash: SOURCE_HASH,
      },
    });
    expect(getResumeReviewState(resume)).toMatchObject({
      confirmed: false,
      allowed: false,
    });
  });
});
