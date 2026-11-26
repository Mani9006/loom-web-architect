/**
 * Pure helpers shared by the My Collection feature (session list, Board,
 * Discover, Stats). Kept framework-free so they can be unit tested.
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
 * Statuses that can only be reached after the candidate has applied. A card
 * dragged from "applied" to "interview" is still an application, so stats
 * must count it as applied, and moving a card straight to one of these
 * should stamp applied_at if it is missing.
 */
export const POST_APPLY_STATUSES: ReadonlySet<string> = new Set([
  "applied",
  "viewed",
  "interview",
  "take_home",
  "offer",
]);

/** Statuses that mean the employer responded positively. */
export const RESPONSE_STATUSES: ReadonlySet<string> = new Set(["viewed", "interview", "take_home", "offer"]);

export interface JobStatusRow {
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
  /** Percent of applications that got a positive response, or null if none applied. */
  responseRate: number | null;
  byStatus: Record<string, number>;
}

export function hasApplied(row: JobStatusRow): boolean {
  return !!row.applied_at || POST_APPLY_STATUSES.has(row.status);
}

export function computeCollectionStats(rows: JobStatusRow[]): CollectionStats {
  const byStatus: Record<string, number> = {};
  let applied = 0;
  let responded = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (hasApplied(r)) {
      applied += 1;
      if (RESPONSE_STATUSES.has(r.status)) responded += 1;
    }
  }
  const count = (s: string) => byStatus[s] ?? 0;
  return {
    total: rows.length,
    saved: count("saved") + count("discovered"),
    applied,
    interviews: count("interview") + count("take_home"),
    offers: count("offer"),
    rejected: count("rejected"),
    responseRate: applied > 0 ? Math.round((responded / applied) * 100) : null,
    byStatus,
  };
}

/**
 * Fields to write when a card moves to `status`. Stamps applied_at when the
 * card reaches any post-apply column for the first time.
 */
export function statusUpdatePatch(
  job: { applied_at: string | null },
  status: string,
  now: Date = new Date(),
): { status: string; applied_at?: string } {
  const patch: { status: string; applied_at?: string } = { status };
  if (POST_APPLY_STATUSES.has(status) && !job.applied_at) patch.applied_at = now.toISOString();
  return patch;
}

/**
 * Returns a safe http(s) URL for use in an href, or null. Rejects
 * javascript:, data:, and other schemes that AI output or pasted text could
 * smuggle in. Bare domains ("boards.greenhouse.io/x") get https:// added.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = String(raw).trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    // No scheme. Only accept things that look like a host name.
    if (!/^[\w-]+(\.[\w-]+)+(\/|$|\?|#|:)/.test(value)) return null;
    value = `https://${value}`;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Normalized identity of a job for de-duplication (case/space-insensitive). */
export function jobKey(company: string, title: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return `${norm(company)}::${norm(title)}`;
}

/** Coerces an AI-provided fit score ("3", 2.6, "strong") into 1..3 or undefined. */
export function normalizeFitScore(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.min(3, Math.max(1, Math.round(n)));
}

/** Makes a string safe to use as a download file name. */
export function safeFilename(name: string, fallback = "resume"): string {
  const cleaned = Array.from(name, (ch) => (ch.charCodeAt(0) < 32 ? " " : ch))
    .join("")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

/** Case-insensitive match of a board search query against a card. */
export function matchesJobQuery(
  job: { job_title: string; company: string; location?: string | null; notes?: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [job.job_title, job.company, job.location ?? "", job.notes ?? ""].some((f) =>
    f.toLowerCase().includes(q),
  );
}
