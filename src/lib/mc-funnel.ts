/**
 * Funnel math for My Collection sessions.
 *
 * Board cards only store their *current* status, so counting
 * `status === "applied"` undercounts: a card that moved on to Interview or
 * Offer was still applied to. That made the "Applied" number shrink as a
 * search progressed and let the response rate exceed 100%.
 *
 * These helpers count stages cumulatively instead: a card counts as applied
 * if it is in any post-application column (or has an `applied_at` stamp),
 * and as interviewed if it reached Interview, Take-home or Offer.
 */

export type TrackedStatus =
  | "discovered"
  | "saved"
  | "applied"
  | "viewed"
  | "interview"
  | "take_home"
  | "offer"
  | "hold"
  | "rejected"
  | "withdrawn";

/** Statuses that can only happen after an application was submitted. */
export const POST_APPLICATION_STATUSES: ReadonlySet<string> = new Set([
  "applied",
  "viewed",
  "interview",
  "take_home",
  "offer",
]);

/** Statuses that mean the candidate reached the interview stage. */
export const INTERVIEW_STATUSES: ReadonlySet<string> = new Set(["interview", "take_home", "offer"]);

export interface FunnelRow {
  status: string;
  applied_at?: string | null;
}

export interface FunnelCounts {
  /** Every live card on the board. */
  total: number;
  /** Cards not yet applied to (discovered + saved). */
  pipeline: number;
  /** Cards that were applied to, regardless of where they are now. */
  applied: number;
  /** Cards that reached interview / take-home / offer. */
  interviews: number;
  offers: number;
  rejected: number;
  withdrawn: number;
  /** Applied cards still waiting on a decision (applied, viewed, interview, take-home, hold-after-apply). */
  active: number;
  /** interviews / applied, as a whole percent. null when nothing was applied to. */
  interviewRate: number | null;
  /** offers / applied, as a whole percent. null when nothing was applied to. */
  offerRate: number | null;
  /** Current count per raw status. */
  byStatus: Record<string, number>;
}

export function wasApplied(row: FunnelRow): boolean {
  return POST_APPLICATION_STATUSES.has(row.status) || !!row.applied_at;
}

function pct(n: number, d: number): number | null {
  if (d <= 0) return null;
  return Math.min(100, Math.round((n / d) * 100));
}

export function computeFunnel(rows: readonly FunnelRow[]): FunnelCounts {
  const byStatus: Record<string, number> = {};
  let applied = 0;
  let interviews = 0;
  let offers = 0;
  let rejected = 0;
  let withdrawn = 0;
  let pipeline = 0;
  let active = 0;

  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    const appliedToThis = wasApplied(row);
    if (appliedToThis) applied += 1;
    if (INTERVIEW_STATUSES.has(row.status)) interviews += 1;
    if (row.status === "offer") offers += 1;
    if (row.status === "rejected") rejected += 1;
    if (row.status === "withdrawn") withdrawn += 1;
    if (!appliedToThis && (row.status === "discovered" || row.status === "saved")) pipeline += 1;
    if (
      appliedToThis &&
      row.status !== "offer" &&
      row.status !== "rejected" &&
      row.status !== "withdrawn"
    ) {
      active += 1;
    }
  }

  return {
    total: rows.length,
    pipeline,
    applied,
    interviews,
    offers,
    rejected,
    withdrawn,
    active,
    interviewRate: pct(interviews, applied),
    offerRate: pct(offers, applied),
    byStatus,
  };
}

/**
 * Fields to write when a card moves to `next`. Stamps `applied_at` the first
 * time a card lands in any post-application column, so dragging straight from
 * Saved to Interview still records that an application happened.
 */
export function statusChangeUpdates(
  current: { applied_at: string | null },
  next: string,
  now: Date = new Date(),
): { status: string; applied_at?: string } {
  const updates: { status: string; applied_at?: string } = { status: next };
  if (POST_APPLICATION_STATUSES.has(next) && !current.applied_at) {
    updates.applied_at = now.toISOString();
  }
  return updates;
}
