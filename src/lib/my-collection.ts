/**
 * Shared logic for the My Collection feature (sessions, board, stats).
 *
 * Kept framework-free so it can be unit tested and reused by the session
 * list, the Board tab, and the Stats tab, which previously each computed
 * their own (inconsistent) numbers.
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

export const TRACKED_STATUSES: TrackedStatus[] = [
  "discovered",
  "saved",
  "applied",
  "viewed",
  "interview",
  "take_home",
  "offer",
  "hold",
  "rejected",
  "withdrawn",
];

/**
 * Statuses that can only be reached after an application went out. A card
 * dragged straight from "Saved" to "Interview" was still applied to, so it
 * must count toward "Applied" totals.
 */
export const POST_APPLY_STATUSES: ReadonlySet<TrackedStatus> = new Set<TrackedStatus>([
  "applied",
  "viewed",
  "interview",
  "take_home",
  "offer",
]);

/** Statuses that mean the employer engaged beyond a passive view. */
export const INTERVIEW_STATUSES: ReadonlySet<TrackedStatus> = new Set<TrackedStatus>([
  "interview",
  "take_home",
  "offer",
]);

export interface TrackedJobLike {
  status: string;
  applied_at?: string | null;
}

/** True when the job has been applied to (by status or by a recorded applied_at). */
export function hasApplied(job: TrackedJobLike): boolean {
  return POST_APPLY_STATUSES.has(job.status as TrackedStatus) || !!job.applied_at;
}

/** True when moving a card to `status` should stamp applied_at (if not already set). */
export function shouldStampAppliedAt(status: TrackedStatus): boolean {
  return POST_APPLY_STATUSES.has(status);
}

export interface CollectionStats {
  total: number;
  saved: number;
  applied: number;
  interviews: number;
  offers: number;
  rejected: number;
  byStatus: Record<TrackedStatus, number>;
  /** Share of applications that reached interview or later, 0-100, null when nothing applied. */
  responseRate: number | null;
}

export function computeCollectionStats(jobs: TrackedJobLike[]): CollectionStats {
  const byStatus = Object.fromEntries(TRACKED_STATUSES.map((s) => [s, 0])) as Record<TrackedStatus, number>;
  let applied = 0;
  let interviews = 0;
  for (const job of jobs) {
    const status = job.status as TrackedStatus;
    if (status in byStatus) byStatus[status] += 1;
    if (hasApplied(job)) applied += 1;
    if (INTERVIEW_STATUSES.has(status)) interviews += 1;
  }
  return {
    total: jobs.length,
    saved: byStatus.saved,
    applied,
    interviews,
    offers: byStatus.offer,
    rejected: byStatus.rejected,
    byStatus,
    responseRate: applied > 0 ? Math.round((interviews / applied) * 100) : null,
  };
}

/** Groups stats per session id; every requested id gets an entry, even with zero jobs. */
export function computeStatsBySession(
  sessionIds: string[],
  rows: (TrackedJobLike & { session_id: string })[],
): Record<string, CollectionStats> {
  const grouped: Record<string, TrackedJobLike[]> = Object.fromEntries(sessionIds.map((id) => [id, []]));
  for (const row of rows) grouped[row.session_id]?.push(row);
  return Object.fromEntries(Object.entries(grouped).map(([id, list]) => [id, computeCollectionStats(list)]));
}

/**
 * Returns the URL only if it is an absolute http(s) URL, otherwise null.
 * Apply URLs come from AI search results and user input, so a
 * `javascript:` or malformed value must never be rendered as an href.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Case/whitespace-insensitive identity for a job so duplicates are caught. */
export function jobIdentityKey(company: string | null | undefined, title: string | null | undefined): string {
  const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${norm(company)}::${norm(title)}`;
}

/** Matches a board card against a free-text query (title, company, location, notes). */
export function matchesJobQuery(
  job: { job_title?: string | null; company?: string | null; location?: string | null; notes?: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [job.job_title, job.company, job.location, job.notes].some((field) =>
    (field ?? "").toLowerCase().includes(q),
  );
}

/** Turns a resume/job name into a filename that is safe on every OS. */
export function safeFileName(name: string | null | undefined, fallback = "resume"): string {
  const cleaned = (name ?? "")
    // eslint-disable-next-line no-control-regex -- stripping control chars is the point
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  return cleaned || fallback;
}
