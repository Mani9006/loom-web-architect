/**
 * Resume import review quarantine.
 *
 * Imported resumes that failed the deterministic source-coverage gate, or
 * whose source was truncated before parsing, must not feed matching,
 * tailoring, profile inference, or submission until the owner explicitly
 * confirms that they reviewed the structured copy against the source file.
 *
 * This module is deliberately runtime-neutral so the React client, Vitest,
 * and Supabase Edge Functions all enforce the same state machine.
 */

export const RESUME_REVIEW_REQUIRED_MESSAGE =
  "Review and confirm this imported résumé before using it for matching, tailoring, or applications.";

export interface ResumeReviewState {
  requiresReview: boolean;
  confirmed: boolean;
  allowed: boolean;
  reason: "low_confidence" | "truncated" | "confirmation_mismatch" | null;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasTruncationEvidence(quality: JsonRecord): boolean {
  if (quality.truncated === true) return true;
  const warnings = Array.isArray(quality.warnings) ? quality.warnings : [];
  return warnings.some((warning) =>
    typeof warning === "string" && /truncat|parser limit|source exceeded/i.test(warning)
  );
}

function hasValidConfirmation(resume: JsonRecord, quality: JsonRecord): {
  confirmed: boolean;
  hashMismatch: boolean;
} {
  const confirmation = record(quality.review_confirmation);
  const confirmedAt = text(confirmation.confirmed_at);
  const timestampIsValid = Boolean(confirmedAt) && Number.isFinite(Date.parse(confirmedAt));
  const isExplicitUserReview =
    confirmation.method === "user_review" && confirmation.version === 1;
  if (!timestampIsValid || !isExplicitUserReview) {
    return { confirmed: false, hashMismatch: false };
  }

  const sourceHash = text(resume.source_hash);
  const confirmedHash = text(confirmation.source_hash);
  if (!sourceHash || confirmedHash !== sourceHash) {
    return { confirmed: false, hashMismatch: true };
  }
  return { confirmed: true, hashMismatch: false };
}

export function getResumeReviewState(value: unknown): ResumeReviewState {
  const resume = record(value);
  const quality = record(resume.parse_quality);
  const sourceHash = text(resume.source_hash);
  const sourceDocumentId = text(resume.source_document_id);
  const parserVersion = text(resume.parser_version);
  const parsedAt = text(resume.parsed_at);
  const hasImportProvenance = Object.keys(quality).length > 0
    || Boolean(sourceHash || sourceDocumentId || parserVersion || parsedAt);
  if (!hasImportProvenance) {
    return { requiresReview: false, confirmed: false, allowed: true, reason: null };
  }

  const observesFullProvenanceContract = [
    "source_document_id",
    "parser_version",
    "parsed_at",
  ].every((key) => Object.prototype.hasOwnProperty.call(resume, key));
  const provenanceIncomplete = !sourceHash
    || Object.keys(quality).length === 0
    || (
      observesFullProvenanceContract
      && (
        !sourceDocumentId
        || !parserVersion
        || !parsedAt
        || !Number.isFinite(Date.parse(parsedAt))
      )
    );
  const truncated = hasTruncationEvidence(quality);
  const lowConfidence = quality.status !== "passed" || provenanceIncomplete;
  const requiresReview = truncated || lowConfidence;
  if (!requiresReview) {
    return { requiresReview: false, confirmed: false, allowed: true, reason: null };
  }
  if (provenanceIncomplete) {
    return {
      requiresReview: true,
      confirmed: false,
      allowed: false,
      reason: "low_confidence",
    };
  }

  const confirmation = hasValidConfirmation(resume, quality);
  if (confirmation.confirmed) {
    return { requiresReview: true, confirmed: true, allowed: true, reason: null };
  }

  return {
    requiresReview: true,
    confirmed: false,
    allowed: false,
    reason: confirmation.hashMismatch
      ? "confirmation_mismatch"
      : truncated ? "truncated" : "low_confidence",
  };
}

export function isResumeAllowedForAutomation(value: unknown): boolean {
  return getResumeReviewState(value).allowed;
}

export function requireResumeAllowedForAutomation(value: unknown): void {
  if (!isResumeAllowedForAutomation(value)) {
    throw new Error(RESUME_REVIEW_REQUIRED_MESSAGE);
  }
}

export function withResumeReviewConfirmation(
  parseQuality: unknown,
  sourceHash: unknown,
  confirmedAt = new Date().toISOString(),
): JsonRecord {
  const quality = record(parseQuality);
  if (!Number.isFinite(Date.parse(confirmedAt))) {
    throw new Error("confirmedAt must be a valid ISO timestamp");
  }
  return {
    ...quality,
    review_confirmation: {
      confirmed_at: confirmedAt,
      source_hash: text(sourceHash) || null,
      method: "user_review",
      version: 1,
    },
  };
}
