export type UserFacingScoreKind =
  | "career_fit"
  | "job_requirement_coverage"
  | "resume_quality"
  | "parsing_confidence";

export const SCORE_LABELS: Record<UserFacingScoreKind, string> = {
  career_fit: "Career fit",
  job_requirement_coverage: "Job-requirement coverage",
  resume_quality: "Résumé quality",
  parsing_confidence: "Parsing confidence",
};

export const SCORE_DESCRIPTIONS: Record<UserFacingScoreKind, string> = {
  career_fit: "Role, experience, location, authorization, and preference fit.",
  job_requirement_coverage: "Extracted requirements from one job that this résumé evidences.",
  resume_quality: "Generic résumé structure and evidence quality, independent of a job.",
  parsing_confidence: "How completely the structured résumé captured the uploaded source.",
};

export const JOB_REQUIREMENT_SCORE_MODEL_PREFIX = "ats-truth-v2:job_match:";
export const JOB_REQUIREMENT_SCORE_MODEL_PATTERN = `${JOB_REQUIREMENT_SCORE_MODEL_PREFIX}%`;

export function isJobRequirementCoverageScoreModel(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(JOB_REQUIREMENT_SCORE_MODEL_PREFIX);
}

export function normalizeScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(Math.max(0, Math.min(100, numeric)));
}

export function careerFitFromEvaluation(
  fitScore: unknown,
  legacyFivePointScore?: unknown,
): number | null {
  const direct = normalizeScore(fitScore);
  if (fitScore !== null && fitScore !== undefined && direct !== null) return direct;

  const legacy = Number(legacyFivePointScore);
  if (!Number.isFinite(legacy) || legacy < 0 || legacy > 5) return null;
  return normalizeScore(legacy * 20);
}

export function formatScore(kind: UserFacingScoreKind, value: unknown): string | null {
  const score = normalizeScore(value);
  return score === null ? null : `${SCORE_LABELS[kind]} ${score}%`;
}

export function jobRequirementCoverageFromStoredScore(
  score: { model?: unknown; overall?: unknown } | null | undefined,
): number | null {
  if (!isJobRequirementCoverageScoreModel(score?.model)) {
    return null;
  }
  return normalizeScore(score.overall);
}
