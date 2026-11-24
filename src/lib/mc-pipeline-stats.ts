/**
 * Pipeline metrics for a My Collection session board.
 *
 * Cards move forward through stages, so counting only rows whose *current*
 * status is "applied" undercounts: a card that advanced to Interview or
 * Offer was still applied to. These helpers count cumulative funnel stages
 * so "Applied" never shrinks as the search progresses and the response
 * rate can't exceed 100%.
 */

export interface PipelineRow {
  status: string;
  applied_at?: string | null;
}

export interface PipelineStats {
  total: number;
  saved: number;
  /** Ever applied: applied_at set, or currently at/after the Applied stage. */
  applied: number;
  /** Reached an interview (interview, take-home, or offer). */
  interviews: number;
  offers: number;
  rejected: number;
  /** Applications that are still waiting on a decision. */
  active: number;
  /** interviews / applied, as a whole percentage; null when nothing applied. */
  responseRate: number | null;
  /** Count of cards per current status. */
  byStatus: Record<string, number>;
}

const POST_APPLY = new Set(["applied", "viewed", "interview", "take_home", "offer", "rejected", "withdrawn"]);
const INTERVIEW_PLUS = new Set(["interview", "take_home", "offer"]);
const CLOSED = new Set(["offer", "rejected", "withdrawn"]);

export function hasApplied(row: PipelineRow): boolean {
  if (row.applied_at) return true;
  // Rejected/withdrawn without applied_at may be a pre-application pass;
  // only count statuses that imply an application was sent.
  return POST_APPLY.has(row.status) && row.status !== "rejected" && row.status !== "withdrawn";
}

export function computePipelineStats(rows: PipelineRow[]): PipelineStats {
  const byStatus: Record<string, number> = {};
  let applied = 0;
  let interviews = 0;
  let active = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const didApply = hasApplied(r);
    if (didApply) applied += 1;
    if (INTERVIEW_PLUS.has(r.status)) interviews += 1;
    if (didApply && !CLOSED.has(r.status)) active += 1;
  }
  // An interview implies an application even if the card skipped Applied.
  applied = Math.max(applied, interviews);
  return {
    total: rows.length,
    saved: byStatus.saved ?? 0,
    applied,
    interviews,
    offers: byStatus.offer ?? 0,
    rejected: byStatus.rejected ?? 0,
    active,
    responseRate: applied > 0 ? Math.round((interviews / applied) * 100) : null,
    byStatus,
  };
}
