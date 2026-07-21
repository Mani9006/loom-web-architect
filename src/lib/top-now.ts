/**
 * "Top 5 right now" strip selection for the Agent page.
 *
 * The pool query already returns eligible, non-dismissed evaluations with
 * fit_score >= 50, ordered by fit_score descending. These helpers decide
 * which of them are actionable right now — pure functions so the strip's
 * rules stay testable.
 */

export interface TopNowEvaluation {
  id: string;
}

export interface TopNowDraft {
  evaluation_id: string | null;
  status: string;
}

/**
 * Evaluations without a submitted draft — the cards the strip shows (max 5).
 * In-flight drafts (draft/ready/queued/failed/skipped) keep their card so the
 * user can watch progress; submitted ones graduate to the activity receipts.
 */
export function selectTopNow<T extends TopNowEvaluation>(pool: T[], drafts: TopNowDraft[], limit = 5): T[] {
  const submitted = new Set(
    drafts
      .filter((draft) => draft.status === "submitted" && draft.evaluation_id)
      .map((draft) => draft.evaluation_id as string),
  );
  return pool.filter((match) => !submitted.has(match.id)).slice(0, limit);
}

/**
 * Strip cards with no draft packet yet — the ones "Apply to all" still needs
 * to tailor (and queue, when auto-apply settings allow). Cards that already
 * have a packet get a per-card Review/Watch action instead of re-tailoring.
 */
export function selectAppliableNow<T extends TopNowEvaluation>(strip: T[], drafts: TopNowDraft[]): T[] {
  const withDraft = new Set(
    drafts
      .filter((draft) => draft.evaluation_id)
      .map((draft) => draft.evaluation_id as string),
  );
  return strip.filter((match) => !withDraft.has(match.id));
}
