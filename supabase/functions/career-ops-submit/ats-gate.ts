export const TRUSTED_ATS_MODEL_PREFIX = "ats-truth-v2:job_match:";
export const ATS_GATE_ERROR_CODE = "ATS_SCORE_GATE_UNMET";
export const ATS_GATE_ERROR_MESSAGE =
  "This application needs a job-requirement score at or above your automatic submission threshold.";

export class AtsSubmissionGateError extends Error {
  readonly status = 412;
  readonly code = ATS_GATE_ERROR_CODE;

  constructor() {
    super(ATS_GATE_ERROR_MESSAGE);
    this.name = "AtsSubmissionGateError";
  }
}

export type AtsGateFailureReason =
  | "invalid_threshold"
  | "missing_trusted_score"
  | "below_threshold";

export type AtsGateDecision =
  | {
    allowed: true;
    minimumScore: number;
    score: number;
  }
  | {
    allowed: false;
    reason: AtsGateFailureReason;
  };

interface AtsGateInput {
  minimumScore: unknown;
  scoreRow:
    | {
      model?: unknown;
      overall?: unknown;
    }
    | null
    | undefined;
}

/**
 * Fail-closed policy for automatic submission.
 *
 * A high legacy/blended ATS value is not enough: only the authoritative
 * job-match methodology for this exact resume/job pair may unlock queueing.
 */
export function evaluateAtsSubmissionGate({
  minimumScore,
  scoreRow,
}: AtsGateInput): AtsGateDecision {
  if (
    typeof minimumScore !== "number" ||
    !Number.isFinite(minimumScore) ||
    minimumScore < 0 ||
    minimumScore > 100
  ) {
    return { allowed: false, reason: "invalid_threshold" };
  }

  const model = typeof scoreRow?.model === "string" ? scoreRow.model : "";
  const score = scoreRow?.overall;
  if (
    !model.startsWith(TRUSTED_ATS_MODEL_PREFIX) ||
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100
  ) {
    return { allowed: false, reason: "missing_trusted_score" };
  }

  if (score < minimumScore) {
    return { allowed: false, reason: "below_threshold" };
  }

  return { allowed: true, minimumScore, score };
}
