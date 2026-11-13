// mc-pipeline.ts, shared status math for My Collection tracked jobs.
//
// A card's `status` is where it is *now*. A job that moved from Applied to
// Interview is still an application, so counting `status === "applied"`
// undercounts applications and can push the response rate past 100%.
// These helpers count by pipeline stage reached instead.

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

/** Statuses that can only be reached after an application went out. */
export const POST_APPLY_STATUSES: readonly TrackedStatus[] = [
  "applied",
  "viewed",
  "interview",
  "take_home",
  "offer",
];

/** Statuses that mean the employer engaged beyond a rejection. */
export const RESPONSE_STATUSES: readonly TrackedStatus[] = ["interview", "take_home", "offer"];

export interface PipelineRow {
  status: string;
  applied_at?: string | null;
}

export interface PipelineCounts {
  total: number;
  saved: number;
  applied: number;
  interviews: number;
  offers: number;
  rejected: number;
  /** Percentage of applications that reached interview/take-home/offer, or null if none applied. */
  responseRate: number | null;
}

export function hasApplied(row: PipelineRow): boolean {
  return Boolean(row.applied_at) || POST_APPLY_STATUSES.includes(row.status as TrackedStatus);
}

export function computePipelineCounts(rows: PipelineRow[]): PipelineCounts {
  let saved = 0;
  let applied = 0;
  let interviews = 0;
  let offers = 0;
  let rejected = 0;
  for (const row of rows) {
    if (row.status === "saved") saved++;
    if (row.status === "rejected") rejected++;
    if (row.status === "offer") offers++;
    if (RESPONSE_STATUSES.includes(row.status as TrackedStatus)) interviews++;
    if (hasApplied(row)) applied++;
  }
  return {
    total: rows.length,
    saved,
    applied,
    interviews,
    offers,
    rejected,
    responseRate: applied > 0 ? Math.round((interviews / applied) * 100) : null,
  };
}

/**
 * Field updates to write when a card moves to `next`. Stamps applied_at the
 * first time a card reaches any post-apply stage, so jumping a card straight
 * from Saved to Interview still records that an application happened.
 */
export function statusChangeUpdates(
  current: PipelineRow,
  next: TrackedStatus,
  now: Date = new Date(),
): Record<string, unknown> {
  const updates: Record<string, unknown> = { status: next };
  if (!current.applied_at && POST_APPLY_STATUSES.includes(next)) {
    updates.applied_at = now.toISOString();
  }
  return updates;
}
