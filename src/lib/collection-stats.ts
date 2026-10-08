/**
 * Pipeline stats for My Collection. A job that has moved from "applied" to
 * "interview" / "offer" / "rejected" was still applied to, so the funnel
 * counts are cumulative rather than a snapshot of the current column.
 */
export interface PipelineStats {
  total: number;
  applied: number;
  interviews: number;
  offers: number;
  rejected: number;
  responseRate: number | null;
}

const APPLIED_OR_LATER = new Set(["applied", "interview", "take_home", "offer", "rejected"]);

export function computePipelineStats(statuses: string[]): PipelineStats {
  const count = (...s: string[]) => statuses.filter((x) => s.includes(x)).length;
  const applied = statuses.filter((s) => APPLIED_OR_LATER.has(s)).length;
  // Interviews include jobs that went on to an offer.
  const interviews = count("interview", "take_home", "offer");
  const offers = count("offer");
  return {
    total: statuses.length,
    applied,
    interviews,
    offers,
    rejected: count("rejected"),
    responseRate: applied > 0 ? Math.min(100, Math.round((interviews / applied) * 100)) : null,
  };
}
