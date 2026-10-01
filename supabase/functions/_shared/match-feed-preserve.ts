export const DETERMINISTIC_FIT_MODEL = "deterministic-career-fit";

export interface ExistingEvaluation {
  scanned_job_id: string;
  model: string | null;
  dismissed_at: string | null;
}

/**
 * Drops match-feed rows that would overwrite an evaluation the user already
 * owns: a manually requested AI evaluation (its report and STAR stories were
 * paid for) or a dismissed ("Passed") row. Only fresh or still-deterministic,
 * undismissed rows are refreshed.
 */
export function withoutPreservedEvaluations<T extends { scanned_job_id: string }>(
  rows: T[],
  existing: ExistingEvaluation[],
): T[] {
  const preserved = new Set(existing
    .filter((row) => row.model !== DETERMINISTIC_FIT_MODEL || Boolean(row.dismissed_at))
    .map((row) => row.scanned_job_id));
  return rows.filter((row) => !preserved.has(row.scanned_job_id));
}
