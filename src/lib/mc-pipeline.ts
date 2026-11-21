/**
 * Shared pipeline helpers for the My Collection feature (sessions, board,
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

/**
 * Statuses that imply the user already submitted an application. A card that
 * moved on to Interview or Offer was still applied to, so "Applied" counts and
 * the response rate must include these, not only cards sitting in the
 * Applied column.
 */
export const POST_APPLY_STATUSES: ReadonlySet<string> = new Set([
  "applied",
  "viewed",
  "interview",
  "take_home",
  "offer",
  "hold",
  "rejected",
]);

export const INTERVIEW_STATUSES: ReadonlySet<string> = new Set(["interview", "take_home", "offer"]);

export function hasApplied(row: { status: string; applied_at?: string | null }): boolean {
  return POST_APPLY_STATUSES.has(row.status) || (row.status === "withdrawn" && !!row.applied_at);
}

export interface PipelineRow {
  status: string;
  company?: string | null;
  applied_at?: string | null;
}

export interface PipelineStats {
  total: number;
  saved: number;
  /** Cards currently sitting in the Applied/Viewed columns (awaiting reply). */
  awaiting: number;
  /** Every card that has been applied to, at any later stage. */
  applied: number;
  /** Cards that reached an interview (including take-home and offer). */
  interviews: number;
  offers: number;
  rejected: number;
  /** Applications submitted within the last 7 days (by applied_at). */
  appliedThisWeek: number;
  /** (interviews) / (applied), rounded percentage, or null if nothing applied. */
  responseRate: number | null;
  topCompanies: { company: string; count: number }[];
}

export function computePipelineStats(rows: PipelineRow[], now: Date = new Date()): PipelineStats {
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  let saved = 0;
  let awaiting = 0;
  let applied = 0;
  let interviews = 0;
  let offers = 0;
  let rejected = 0;
  let appliedThisWeek = 0;
  const companyCounts = new Map<string, { company: string; count: number }>();

  for (const r of rows) {
    if (r.status === "saved") saved++;
    if (r.status === "applied" || r.status === "viewed") awaiting++;
    if (hasApplied(r)) applied++;
    if (INTERVIEW_STATUSES.has(r.status)) interviews++;
    if (r.status === "offer") offers++;
    if (r.status === "rejected") rejected++;
    if (r.applied_at) {
      const t = Date.parse(r.applied_at);
      if (!Number.isNaN(t) && t >= weekAgo && t <= now.getTime()) appliedThisWeek++;
    }
    const company = (r.company ?? "").trim();
    if (company) {
      const k = company.toLowerCase();
      const cur = companyCounts.get(k);
      if (cur) cur.count++;
      else companyCounts.set(k, { company, count: 1 });
    }
  }

  const topCompanies = Array.from(companyCounts.values())
    .sort((a, b) => b.count - a.count || a.company.localeCompare(b.company))
    .slice(0, 5);

  return {
    total: rows.length,
    saved,
    awaiting,
    applied,
    interviews,
    offers,
    rejected,
    appliedThisWeek,
    responseRate: applied > 0 ? Math.round((interviews / applied) * 100) : null,
    topCompanies,
  };
}

/**
 * Normalizes a user- or AI-supplied URL into something safe to put in an
 * href. Bare domains ("stripe.com/jobs/1") get https:// so they don't render
 * as broken relative links; anything that isn't http(s) (javascript:, data:,
 * etc.) is rejected.
 */
export function toSafeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  // "localhost:3000" style strings look like a scheme; only treat known
  // web schemes as schemes, otherwise assume a bare host.
  const candidate =
    hasScheme && !/^[a-z0-9.-]+:\d+/i.test(trimmed)
      ? trimmed
      : `https://${trimmed.replace(/^\/+/, "")}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Case/whitespace-insensitive identity for a job, used for duplicate detection. */
export function trackedJobKey(company: string, title: string): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(company)}::${norm(title)}`;
}
