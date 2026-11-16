/**
 * Shared, pure helpers for the "My Collection" feature (sessions, board,
 * stats). Kept free of React/Supabase so they can be unit-tested and so the
 * session list, Board, and Stats tab all count things the same way.
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

export const TRACKED_STATUSES: readonly TrackedStatus[] = [
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

/** Statuses that can only be reached after the user submitted an application. */
const POST_APPLICATION: ReadonlySet<string> = new Set([
  "applied",
  "viewed",
  "interview",
  "take_home",
  "offer",
]);

/** Statuses that mean the employer engaged (interview stage or later). */
const INTERVIEW_STAGE: ReadonlySet<string> = new Set(["interview", "take_home", "offer"]);

export function isTrackedStatus(value: unknown): value is TrackedStatus {
  return typeof value === "string" && (TRACKED_STATUSES as readonly string[]).includes(value);
}

/** True when moving a card into `status` implies the user already applied. */
export function impliesApplied(status: string): boolean {
  return POST_APPLICATION.has(status);
}

export interface StatusRow {
  status: string;
  applied_at?: string | null;
}

export interface CollectionSummary {
  /** Every live card on the board. */
  total: number;
  /** Cards still sitting in Saved. */
  saved: number;
  /**
   * Cumulative: every card that has been applied to, including ones that
   * have since progressed to interview/offer or ended in rejection. A card
   * moving from Applied → Interview must not make the Applied count drop.
   */
  applied: number;
  /** Cumulative: interview, take-home, or offer. */
  interviews: number;
  offers: number;
  rejected: number;
  /** interviews / applied as a 0–100 integer, or null with no applications. */
  responseRate: number | null;
}

export function summarizeTrackedJobs(rows: readonly StatusRow[]): CollectionSummary {
  let saved = 0;
  let applied = 0;
  let interviews = 0;
  let offers = 0;
  let rejected = 0;
  for (const r of rows) {
    const s = r.status;
    if (s === "saved") saved++;
    if (s === "offer") offers++;
    if (s === "rejected") rejected++;
    if (INTERVIEW_STAGE.has(s)) interviews++;
    // Rejected / withdrawn / hold cards count as applied only when we know
    // an application went out (applied_at was stamped).
    if (POST_APPLICATION.has(s) || (r.applied_at && s !== "saved" && s !== "discovered")) {
      applied++;
    }
  }
  const responseRate = applied > 0 ? Math.min(100, Math.round((interviews / applied) * 100)) : null;
  return { total: rows.length, saved, applied, interviews, offers, rejected, responseRate };
}

/** Stable identity for a discovered job, used for de-duplicating saves. */
export function jobIdentityKey(company: string, title: string): string {
  const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(company)}::${norm(title)}`;
}

export interface SearchableJob {
  job_title: string;
  company: string;
  location?: string | null;
  notes?: string | null;
}

/** Case-insensitive match of every whitespace-separated term against a card. */
export function matchesJobQuery(job: SearchableJob, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [job.job_title, job.company, job.location ?? "", job.notes ?? ""]
    .join(" ")
    .toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

/**
 * Returns a normalized http(s) URL safe to put in an href, or null.
 * Apply URLs are user-typed or AI-generated, so `javascript:`/`data:` and
 * other schemes must never reach an anchor. A bare host like
 * "jobs.acme.com/123" is upgraded to https.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  const candidate = hasScheme ? value : `https://${value.replace(/^\/+/, "")}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.toString();
  } catch {
    return null;
  }
}
