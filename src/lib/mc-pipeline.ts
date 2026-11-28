/**
 * Pure helpers for My Collection pipeline math (session cards, Stats tab,
 * Board filters, Discover de-duplication). Kept framework-free so they are
 * unit-testable.
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

/** Statuses that can only be reached after an application was submitted. */
const POST_APPLY: ReadonlySet<string> = new Set(["applied", "viewed", "interview", "take_home", "offer"]);
/** Statuses that mean the employer engaged beyond a rejection. */
const INTERVIEWING: ReadonlySet<string> = new Set(["interview", "take_home"]);

export interface PipelineRow {
  status: string;
  applied_at?: string | null;
  company?: string | null;
  created_at?: string | null;
}

export interface PipelineStats {
  total: number;
  /** Cards that were ever applied to (current status is applied or later, or applied_at set). */
  applied: number;
  /** Cards currently in interview / take-home. */
  interviewing: number;
  /** Cards that reached interview or beyond (interview, take-home, offer). */
  reachedInterview: number;
  offers: number;
  rejected: number;
  /** Count per raw status. */
  byStatus: Record<TrackedStatus, number>;
  /** Share (0-100) of applied cards that reached interview or offer; null when nothing applied. */
  responseRate: number | null;
}

export function wasApplied(row: PipelineRow): boolean {
  return POST_APPLY.has(row.status) || !!row.applied_at;
}

export function computePipelineStats(rows: PipelineRow[]): PipelineStats {
  const byStatus = Object.fromEntries(TRACKED_STATUSES.map((s) => [s, 0])) as Record<TrackedStatus, number>;
  let applied = 0;
  let reachedInterview = 0;
  for (const r of rows) {
    if (r.status in byStatus) byStatus[r.status as TrackedStatus] += 1;
    const appliedRow = wasApplied(r);
    if (appliedRow) applied += 1;
    if (appliedRow && (INTERVIEWING.has(r.status) || r.status === "offer")) reachedInterview += 1;
  }
  const interviewing = byStatus.interview + byStatus.take_home;
  return {
    total: rows.length,
    applied,
    interviewing,
    reachedInterview,
    offers: byStatus.offer,
    rejected: byStatus.rejected,
    byStatus,
    responseRate: applied > 0 ? Math.round((reachedInterview / applied) * 100) : null,
  };
}

/** Group rows by session id and compute stats per session. */
export function statsBySession<T extends PipelineRow & { session_id: string }>(
  sessionIds: string[],
  rows: T[],
): Record<string, PipelineStats> {
  const grouped: Record<string, T[]> = Object.fromEntries(sessionIds.map((id) => [id, []]));
  for (const r of rows) (grouped[r.session_id] ??= []).push(r);
  return Object.fromEntries(Object.entries(grouped).map(([id, list]) => [id, computePipelineStats(list)]));
}

/** Top companies by card count, ties broken alphabetically. */
export function topCompanies(rows: PipelineRow[], limit = 5): { company: string; count: number }[] {
  const counts = new Map<string, { company: string; count: number }>();
  for (const r of rows) {
    const name = (r.company ?? "").trim();
    if (!name) continue;
    const k = name.toLowerCase();
    const cur = counts.get(k);
    if (cur) cur.count += 1;
    else counts.set(k, { company: name, count: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.company.localeCompare(b.company))
    .slice(0, limit);
}

/**
 * Normalized identity for a job posting, used to avoid saving the same
 * company/title pair twice. Case, whitespace and punctuation-insensitive.
 */
export function jobKey(company: string | null | undefined, title: string | null | undefined): string {
  const norm = (s: string | null | undefined) =>
    (s ?? "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  return `${norm(company)}::${norm(title)}`;
}

/** Case-insensitive match of a free-text query against a card's text fields. */
export function matchesQuery(
  job: { job_title?: string | null; company?: string | null; location?: string | null; notes?: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [job.job_title, job.company, job.location, job.notes].filter(Boolean).join(" ").toLowerCase();
  return q.split(/\s+/).every((term) => hay.includes(term));
}

/** Stable sort: highest fit score first, unscored results last. */
export function sortByFit<T extends { fit_score?: number }>(jobs: T[]): T[] {
  return jobs
    .map((j, i) => ({ j, i }))
    .sort((a, b) => {
      const fa = typeof a.j.fit_score === "number" ? a.j.fit_score : -Infinity;
      const fb = typeof b.j.fit_score === "number" ? b.j.fit_score : -Infinity;
      return fb - fa || a.i - b.i;
    })
    .map(({ j }) => j);
}

/**
 * Returns the URL only if it is an absolute http(s) link, otherwise null.
 * apply_url comes from user input and AI output, so it must never be able
 * to put a `javascript:`/`data:` URL into an anchor's href. Bare domains
 * ("jobs.example.com/123") are upgraded to https.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : /^[\w-]+(\.[\w-]+)+/.test(v) ? `https://${v}` : null;
  if (!candidate) return null;
  try {
    const u = new URL(candidate);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
