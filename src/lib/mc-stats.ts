export interface McStatusRow {
  status: string;
}

export interface McStats {
  total: number;
  applied: number;
  interviews: number;
  offers: number;
  rejected: number;
  responded: number;
  responseRate: number | null;
}

// Statuses that mean the user has submitted an application at some point.
const APPLIED_OR_LATER = new Set([
  "applied",
  "viewed",
  "interview",
  "take_home",
  "offer",
  "rejected",
  "withdrawn",
]);
const INTERVIEW_STATUSES = new Set(["interview", "take_home"]);

/**
 * Summarise a session's board. "Applied" counts every job that has been
 * applied to, including those that moved on to later stages, so the
 * response rate can never exceed 100%.
 */
export function computeMcStats(rows: McStatusRow[]): McStats {
  const applied = rows.filter((r) => APPLIED_OR_LATER.has(r.status)).length;
  const interviews = rows.filter((r) => INTERVIEW_STATUSES.has(r.status)).length;
  const offers = rows.filter((r) => r.status === "offer").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;
  const responded = interviews + offers;
  return {
    total: rows.length,
    applied,
    interviews,
    offers,
    rejected,
    responded,
    responseRate: applied > 0 ? Math.min(100, Math.round((responded / applied) * 100)) : null,
  };
}
