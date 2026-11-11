/**
 * Pure helpers shared by the My Collection feature (sessions list, board,
 * discover, stats). Kept framework-free so they're unit-testable.
 */

export const SESSION_TABS = ["discover", "resumes", "board", "inbox", "stats"] as const;
export type SessionTab = (typeof SESSION_TABS)[number];

export function isSessionTab(value: string | null | undefined): value is SessionTab {
  return !!value && (SESSION_TABS as readonly string[]).includes(value);
}

/**
 * Statuses that imply the candidate has already applied. A card that moved
 * from Applied → Interview → Offer still counts as an application, so the
 * "Applied" metric must include every downstream stage, not just cards
 * currently sitting in the Applied column.
 */
const POST_APPLY_STATUSES = new Set(["applied", "viewed", "interview", "take_home", "offer"]);
const INTERVIEW_OR_LATER = new Set(["interview", "take_home", "offer"]);

export interface TrackedJobLike {
  status: string;
  applied_at?: string | null;
}

export interface CollectionStats {
  total: number;
  saved: number;
  applied: number;
  interviews: number;
  offers: number;
  rejected: number;
  /** Percentage of applications that reached interview or later; null if none applied. */
  responseRate: number | null;
}

export function computeCollectionStats(rows: TrackedJobLike[]): CollectionStats {
  let saved = 0;
  let applied = 0;
  let interviews = 0;
  let offers = 0;
  let rejected = 0;
  for (const r of rows) {
    if (r.status === "saved") saved++;
    if (POST_APPLY_STATUSES.has(r.status) || !!r.applied_at) applied++;
    if (INTERVIEW_OR_LATER.has(r.status)) interviews++;
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
    responseRate: applied > 0 ? Math.round((interviews / applied) * 100) : null,
  };
}

/**
 * Normalizes a user- or AI-supplied apply URL before it is stored.
 * - blank → null
 * - "stripe.com/jobs/1" → "https://stripe.com/jobs/1" (otherwise the <a>
 *   would resolve relative to the app and 404)
 * - non-http(s) schemes (javascript:, data:, mailto: …) → null
 */
export function normalizeApplyUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
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

/** Returns a safe href for rendering, or null if the URL isn't http(s). */
export function safeExternalHref(raw: string | null | undefined): string | null {
  return normalizeApplyUrl(raw);
}

/** Case/whitespace-insensitive identity for a job, used to avoid duplicate board cards. */
export function jobDedupKey(company: string, title: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return `${norm(company)}::${norm(title)}`;
}

/** Free-text filter used by the board search box. */
export function matchesJobQuery(
  job: { job_title: string; company: string; location?: string | null; notes?: string | null },
  query: string,
): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const haystack = [job.job_title, job.company, job.location ?? "", job.notes ?? ""].join(" ").toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

/** Stable sort: highest fit_score first, unknown scores last, original order otherwise. */
export function sortByFit<T extends { fit_score?: number }>(jobs: T[]): T[] {
  return jobs
    .map((job, idx) => ({ job, idx }))
    .sort((a, b) => {
      const fa = typeof a.job.fit_score === "number" ? a.job.fit_score : -Infinity;
      const fb = typeof b.job.fit_score === "number" ? b.job.fit_score : -Infinity;
      if (fb !== fa) return fb - fa;
      return a.idx - b.idx;
    })
    .map(({ job }) => job);
}

/** Parses a comma/newline separated list, trimming and dropping duplicates (case-insensitive). */
export function parseList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,\n]/)) {
    const v = part.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** Parses a comp target input; returns null for blank, non-numeric, or non-positive values. */
export function parseCompTarget(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
