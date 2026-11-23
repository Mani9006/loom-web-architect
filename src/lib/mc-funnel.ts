/**
 * Shared funnel math for My Collection sessions.
 *
 * A tracked job only sits in one Board column at a time, so counting
 * "applied" as `status === "applied"` undercounts: a job that moved on to
 * Interview or Offer was still applied to. These helpers treat every
 * post-application stage as applied, which keeps the session cards, the
 * Stats tab and the response rate consistent (and the rate <= 100%).
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

/** Statuses that can only be reached after the user has applied. */
export const POST_APPLY_STATUSES: readonly TrackedStatus[] = [
  "applied",
  "viewed",
  "interview",
  "take_home",
  "offer",
  "rejected",
];

const INTERVIEW_STATUSES: readonly string[] = ["interview", "take_home", "offer"];

export function isPostApplyStatus(status: string): boolean {
  return (POST_APPLY_STATUSES as readonly string[]).includes(status);
}

export interface FunnelRow {
  status: string;
  applied_at?: string | null;
}

export interface FunnelCounts {
  total: number;
  saved: number;
  /** Every job the user applied to, whatever stage it is in now. */
  applied: number;
  /** Jobs that reached an interview stage (including those now at offer). */
  interviews: number;
  offers: number;
  rejected: number;
  /** interviews / applied as a whole percentage, or null with no applications. */
  responseRate: number | null;
}

/** True when the row represents a job the user has applied to. */
export function hasApplied(row: FunnelRow): boolean {
  // Hold / withdrawn are ambiguous on status alone; applied_at settles it.
  return isPostApplyStatus(row.status) || Boolean(row.applied_at);
}

export function computeFunnel(rows: readonly FunnelRow[]): FunnelCounts {
  let saved = 0;
  let applied = 0;
  let interviews = 0;
  let offers = 0;
  let rejected = 0;
  for (const r of rows) {
    if (r.status === "saved") saved++;
    if (hasApplied(r)) applied++;
    if (INTERVIEW_STATUSES.includes(r.status)) interviews++;
    if (r.status === "offer") offers++;
    if (r.status === "rejected") rejected++;
  }
  return {
    total: rows.length,
    saved,
    applied,
    interviews,
    offers,
    rejected,
    responseRate: applied > 0 ? Math.round((Math.min(interviews, applied) / applied) * 100) : null,
  };
}

/**
 * Fields to write when a card moves to `status`. Stamps applied_at the first
 * time a job reaches any post-apply stage, so jobs dragged straight from
 * Saved to Interview still carry an application date.
 */
export function statusUpdateFields(
  current: { applied_at: string | null },
  status: TrackedStatus,
  now: Date = new Date(),
): { status: TrackedStatus; applied_at?: string } {
  const updates: { status: TrackedStatus; applied_at?: string } = { status };
  if (isPostApplyStatus(status) && !current.applied_at) {
    updates.applied_at = now.toISOString();
  }
  return updates;
}
