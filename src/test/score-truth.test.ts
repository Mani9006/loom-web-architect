import { describe, expect, it } from "vitest";

import {
  careerFitFromEvaluation,
  formatScore,
  isJobRequirementCoverageScoreModel,
  jobRequirementCoverageFromStoredScore,
  JOB_REQUIREMENT_SCORE_MODEL_PATTERN,
  normalizeScore,
  SCORE_LABELS,
} from "@/lib/score-truth";

describe("user-facing score truth", () => {
  it("uses distinct, stable labels for each score methodology", () => {
    expect(new Set(Object.values(SCORE_LABELS)).size).toBe(4);
    expect(SCORE_LABELS.career_fit).toBe("Career fit");
    expect(SCORE_LABELS.job_requirement_coverage).toBe("Job-requirement coverage");
    expect(SCORE_LABELS.resume_quality).toBe("Résumé quality");
    expect(SCORE_LABELS.parsing_confidence).toBe("Parsing confidence");
  });

  it("clamps finite percentages and rejects unavailable values", () => {
    expect(normalizeScore(82.6)).toBe(83);
    expect(normalizeScore(-3)).toBe(0);
    expect(normalizeScore(107)).toBe(100);
    expect(normalizeScore(null)).toBeNull();
    expect(normalizeScore(undefined)).toBeNull();
    expect(normalizeScore("not-a-score")).toBeNull();
  });

  it("prefers the 0–100 career-fit score and converts only valid legacy 0–5 values", () => {
    expect(careerFitFromEvaluation(91, 2)).toBe(91);
    expect(careerFitFromEvaluation(null, 4.25)).toBe(85);
    expect(careerFitFromEvaluation(undefined, 90)).toBeNull();
  });

  it("formats the methodology beside the number", () => {
    expect(formatScore("career_fit", 91)).toBe("Career fit 91%");
    expect(formatScore("job_requirement_coverage", 73)).toBe("Job-requirement coverage 73%");
    expect(formatScore("resume_quality", 84)).toBe("Résumé quality 84%");
    expect(formatScore("parsing_confidence", 96)).toBe("Parsing confidence 96%");
  });

  it("accepts only authoritative stored job-coverage rows", () => {
    expect(JOB_REQUIREMENT_SCORE_MODEL_PATTERN).toBe("ats-truth-v2:job_match:%");
    expect(isJobRequirementCoverageScoreModel("ats-truth-v2:job_match:cache:openai")).toBe(true);
    expect(isJobRequirementCoverageScoreModel("ats-truth-v2:resume_quality:rules-only")).toBe(false);
    expect(jobRequirementCoverageFromStoredScore({
      model: "ats-truth-v2:job_match:cache:openai",
      overall: 82.6,
    })).toBe(83);
    expect(jobRequirementCoverageFromStoredScore({
      model: "ats-truth-v2:resume_quality:rules-only",
      overall: 96,
    })).toBeNull();
    expect(jobRequirementCoverageFromStoredScore({
      model: "legacy-blended-score",
      overall: 91,
    })).toBeNull();
  });
});
