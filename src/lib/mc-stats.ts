/**
 * Shared pipeline math for My Collection sessions.
 *
 * A tracked job only ever has ONE current status, but the pipeline is
 * cumulative: a card sitting in "Interview" was also applied to. Counting
 * `status === "applied"` alone undercounts applications as soon as cards
 * progress, and made the response rate exceed 100%.
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

export const TRACKED_STATUS_LABELS: Record<TrackedStatus, string> = {
  discovered: "Discovered",
  saved: "Saved",
  applied: "Applied",
  viewed: "Viewed",
  interview: "Interview",
  take_home: "Take-home",
  offer: "Offer",
  hold: "Hold",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const TRACKED_STATUSES = Object.keys(TRACKED_STATUS_LABELS) as TrackedStatus[];

/** Statuses that imply the candidate has submitted an application. */
const POST_APPLY: ReadonlySet<string> = new Set(["applied", "viewed", "interview", "take_home", "offer"]);
/** Statuses that imply the employer has engaged (interview stage or beyond). */
const INTERVIEW_OR_LATER: ReadonlySet<string> = new Set(["interview", "take_home", "offer"]);
/** Terminal statuses: the card no longer needs action. */
const CLOSED: ReadonlySet<string> = new Set(["offer", "rejected", "withdrawn"]);

export interface StatsRow {
  status: string;
  applied_at?: string | null;
}

export interface SessionStats {
  total: number;
  saved: number;
  applied: number;
  interviews: number;
  offers: number;
  rejected: number;
  /** Cards still in play (not offer/rejected/withdrawn). */
  open: number;
  /** Interviews ÷ applied, 0-100, or null when nothing was applied to. */
  responseRate: number | null;
  byStatus: Record<TrackedStatus, number>;
}

export function isPostApplyStatus(status: string): boolean {
  return POST_APPLY.has(status);
}

export function hasApplied(row: StatsRow): boolean {
  return POST_APPLY.has(row.status) || Boolean(row.applied_at);
}

export function computeSessionStats(rows: readonly StatsRow[]): SessionStats {
  const byStatus = Object.fromEntries(TRACKED_STATUSES.map((s) => [s, 0])) as Record<TrackedStatus, number>;
  let applied = 0;
  let interviews = 0;
  let open = 0;
  for (const row of rows) {
    if (row.status in byStatus) byStatus[row.status as TrackedStatus] += 1;
    if (hasApplied(row)) applied += 1;
    if (INTERVIEW_OR_LATER.has(row.status)) interviews += 1;
    if (!CLOSED.has(row.status)) open += 1;
  }
  return {
    total: rows.length,
    saved: byStatus.saved,
    applied,
    interviews,
    offers: byStatus.offer,
    rejected: byStatus.rejected,
    open,
    responseRate: applied > 0 ? Math.min(100, Math.round((interviews / applied) * 100)) : null,
    byStatus,
  };
}

export interface SearchableJob {
  job_title: string;
  company: string;
  location?: string | null;
  notes?: string | null;
}

/** Case-insensitive, all-terms-must-match filter for board cards. */
export function filterJobsByQuery<T extends SearchableJob>(jobs: readonly T[], query: string): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...jobs];
  return jobs.filter((job) => {
    const haystack = [job.job_title, job.company, job.location ?? "", job.notes ?? ""].join(" ").toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}

/** Split a comma/newline separated list, trim, and de-duplicate case-insensitively. */
export function parseListInput(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const item = raw.trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Parse a compensation target. Accepts "120000", "$120,000" and "120k".
 * Returns null for blank, non-numeric or non-positive input instead of
 * persisting NaN/negative numbers into target_profile.
 */
export function parseCompTarget(text: string): number | null {
  const cleaned = text.trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const match = /^(\d+(?:\.\d+)?)(k)?$/.exec(cleaned);
  if (!match) return null;
  const value = Number(match[1]) * (match[2] ? 1000 : 1);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}
