/**
 * Shared, pure helpers for the My Collection feature (session list, board,
 * stats). Kept framework-free so they can be unit tested.
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

/** Statuses that can only be reached after the application was submitted. */
const POST_APPLY_STATUSES = new Set<string>(["applied", "viewed", "interview", "take_home", "offer"]);
const INTERVIEW_STATUSES = new Set<string>(["interview", "take_home", "offer"]);

export interface PipelineRow {
  status: string;
  applied_at?: string | null;
}

export interface PipelineStats {
  /** Every live card on the board. */
  total: number;
  saved: number;
  /**
   * Cards that were ever applied to. A card that moved on to Interview,
   * Offer, or was Rejected after applying still counts, so the funnel and
   * response rate stay consistent instead of shrinking as jobs progress.
   */
  applied: number;
  /** Cards that reached an interview stage or beyond (incl. take-home and offer). */
  interviewing: number;
  offer: number;
  rejected: number;
  /** interviewing / applied, as a whole percentage, or null when nothing applied. */
  responseRate: number | null;
}

export function wasApplied(row: PipelineRow): boolean {
  return POST_APPLY_STATUSES.has(row.status) || Boolean(row.applied_at);
}

export function computePipelineStats(rows: PipelineRow[]): PipelineStats {
  let saved = 0;
  let applied = 0;
  let interviewing = 0;
  let offer = 0;
  let rejected = 0;
  for (const row of rows) {
    if (row.status === "saved") saved++;
    if (row.status === "offer") offer++;
    if (row.status === "rejected") rejected++;
    if (INTERVIEW_STATUSES.has(row.status)) interviewing++;
    if (wasApplied(row) || INTERVIEW_STATUSES.has(row.status)) applied++;
  }
  return {
    total: rows.length,
    saved,
    applied,
    interviewing,
    offer,
    rejected,
    responseRate: applied > 0 ? Math.round((interviewing / applied) * 100) : null,
  };
}

/**
 * Only allow http(s) links to be rendered as hrefs. Job URLs come from AI
 * output and free-text user input, so a `javascript:` or `data:` URL must
 * never reach an anchor. Bare domains ("acme.com/jobs/1") get https://.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export const SESSION_TABS = ["discover", "resumes", "board", "inbox", "stats"] as const;
export type SessionTab = (typeof SESSION_TABS)[number];

export function normalizeSessionTab(value: string | null | undefined): SessionTab | null {
  return value && (SESSION_TABS as readonly string[]).includes(value) ? (value as SessionTab) : null;
}

/** Case-insensitive match of a board card against a free-text query. */
export function matchesJobQuery(
  job: { job_title: string; company: string; location?: string | null; notes?: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [job.job_title, job.company, job.location, job.notes]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(q));
}

/** Stable identity for de-duplicating a job within a session. */
export function jobDedupeKey(company: string, title: string): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(company)}::${norm(title)}`;
}
