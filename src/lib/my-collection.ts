/**
 * Shared, pure helpers for the My Collection feature (sessions, board,
 * stats, discover). Kept free of React/Supabase so they're unit-testable.
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

/** Statuses that imply the candidate has already submitted an application. */
const POST_APPLY_STATUSES = new Set<string>([
  "applied",
  "viewed",
  "interview",
  "take_home",
  "offer",
  "rejected",
  "withdrawn",
]);

/** Statuses that mean the employer engaged beyond an automated reply. */
const INTERVIEW_STATUSES = new Set<string>(["interview", "take_home", "offer"]);

export interface TrackedJobLike {
  status: string;
  applied_at?: string | null;
  company?: string | null;
}

export interface CollectionStats {
  /** Every non-deleted card on the board. */
  total: number;
  /** Cards still waiting to be applied to (discovered + saved). */
  pipeline: number;
  /** Cards that have been applied to at any point, including ones that later moved on. */
  applied: number;
  /** Cards currently at the interview, take-home or offer stage. */
  interviews: number;
  offers: number;
  rejected: number;
  /** interviews / applied as a 0-100 integer, or null when nothing has been applied to. */
  responseRate: number | null;
}

/**
 * True when a card represents a submitted application. A card that moved from
 * Applied to Interview is still an application, so counting only
 * `status === "applied"` undercounts and lets the response rate exceed 100%.
 */
export function hasApplied(job: TrackedJobLike): boolean {
  if (POST_APPLY_STATUSES.has(job.status)) return true;
  // A card dragged back to Saved/Hold after applying keeps its applied_at.
  return !!job.applied_at;
}

export function computeCollectionStats(jobs: TrackedJobLike[]): CollectionStats {
  let pipeline = 0;
  let applied = 0;
  let interviews = 0;
  let offers = 0;
  let rejected = 0;
  for (const job of jobs) {
    if (hasApplied(job)) applied += 1;
    else if (job.status === "discovered" || job.status === "saved") pipeline += 1;
    if (INTERVIEW_STATUSES.has(job.status)) interviews += 1;
    if (job.status === "offer") offers += 1;
    if (job.status === "rejected") rejected += 1;
  }
  return {
    total: jobs.length,
    pipeline,
    applied,
    interviews,
    offers,
    rejected,
    responseRate: applied > 0 ? Math.min(100, Math.round((interviews / applied) * 100)) : null,
  };
}

/** Groups rows by session id and computes stats for every requested session. */
export function computeStatsBySession<T extends TrackedJobLike & { session_id: string }>(
  sessionIds: string[],
  rows: T[],
): Record<string, CollectionStats> {
  const grouped: Record<string, T[]> = {};
  for (const id of sessionIds) grouped[id] = [];
  for (const row of rows) grouped[row.session_id]?.push(row);
  const out: Record<string, CollectionStats> = {};
  for (const id of sessionIds) out[id] = computeCollectionStats(grouped[id]);
  return out;
}

/** Top companies by card count, ties broken alphabetically. */
export function topCompanies(jobs: TrackedJobLike[], limit = 5): { company: string; count: number }[] {
  const counts = new Map<string, { company: string; count: number }>();
  for (const job of jobs) {
    const name = (job.company ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { company: name, count: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.company.localeCompare(b.company))
    .slice(0, limit);
}

/**
 * Returns the URL only if it is an absolute http(s) link. Apply URLs come
 * from AI output (which can be steered by scraped web content) and from user
 * input, so anything else, `javascript:` in particular, must never reach an
 * href.
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/** Case/whitespace-insensitive identity for a job, used to dedupe saves. */
export function jobIdentityKey(company: string | null | undefined, title: string | null | undefined): string {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(company)}::${norm(title)}`;
}

/** Splits a comma-separated input into trimmed, non-empty, de-duplicated entries. */
export function parseCommaList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(",")) {
    const value = part.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/** Parses a compensation input, returning a positive whole number or null. */
export function parseCompTarget(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/** Case-insensitive match of a free-text query against a card's main fields. */
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

/**
 * Normalizes a user-typed apply URL. Blank input is allowed (returns url:
 * null); a bare domain like "linkedin.com/jobs/view/1" gets https:// added;
 * anything that still isn't an http(s) URL is reported as invalid.
 */
export function normalizeApplyUrl(text: string): { ok: true; url: string | null } | { ok: false } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, url: null };
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  const safe = safeExternalUrl(candidate);
  if (!safe) return { ok: false };
  // Require something that looks like a host with a dot (or localhost).
  const host = new URL(safe).hostname;
  if (!host.includes(".") && host !== "localhost") return { ok: false };
  return { ok: true, url: safe };
}
