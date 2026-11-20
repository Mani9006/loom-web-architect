/**
 * Pure helpers shared by the My Collection feature (sessions, board, stats,
 * discover). Kept free of React/Supabase so they can be unit tested.
 */

/** Statuses a card can only reach after the candidate actually applied. */
export const POST_APPLY_STATUSES = [
  "applied",
  "viewed",
  "interview",
  "take_home",
  "offer",
] as const;

/** Statuses that mean the employer engaged beyond the application. */
export const RESPONSE_STATUSES = ["interview", "take_home", "offer"] as const;

export interface TrackedJobStatsRow {
  status: string;
  applied_at?: string | null;
}

export interface SessionFunnelStats {
  /** Every live (non-trashed) card on the board. */
  onBoard: number;
  /** Cards the candidate has applied to, regardless of where they are now. */
  applied: number;
  /** Cards currently at interview or take-home stage. */
  interviews: number;
  offers: number;
  rejected: number;
  /** Cards that progressed to interview/take-home/offer. */
  responses: number;
  /** responses / applied as a whole percent, or null if nothing applied yet. */
  responseRate: number | null;
}

function hasApplied(row: TrackedJobStatsRow): boolean {
  if (row.applied_at) return true;
  return (POST_APPLY_STATUSES as readonly string[]).includes(row.status);
}

/**
 * Computes funnel stats for a session's cards.
 *
 * "Applied" counts every card that has ever been applied to (status past
 * the application stage, or an applied_at timestamp, which also covers
 * rejected/withdrawn/hold cards that were applied first). Counting only
 * cards whose *current* status is "applied" made the number shrink as
 * cards progressed and let the response rate exceed 100%.
 */
export function computeSessionStats(rows: TrackedJobStatsRow[]): SessionFunnelStats {
  let applied = 0;
  let interviews = 0;
  let offers = 0;
  let rejected = 0;
  let responses = 0;

  for (const row of rows) {
    const isResponse = (RESPONSE_STATUSES as readonly string[]).includes(row.status);
    if (hasApplied(row)) applied += 1;
    if (row.status === "interview" || row.status === "take_home") interviews += 1;
    if (row.status === "offer") offers += 1;
    if (row.status === "rejected") rejected += 1;
    if (isResponse) responses += 1;
  }

  return {
    onBoard: rows.length,
    applied,
    interviews,
    offers,
    rejected,
    responses,
    responseRate: applied > 0 ? Math.min(100, Math.round((responses / applied) * 100)) : null,
  };
}

/**
 * Normalises a user- or AI-supplied link into a safe http(s) URL.
 * Returns null for anything that isn't http(s) (javascript:, data:, etc.),
 * which would otherwise execute script when rendered as an <a href>.
 * Bare domains like "stripe.com/jobs/1" are upgraded to https.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  let candidate = trimmed;
  if (!hasScheme) {
    if (trimmed.startsWith("//")) candidate = `https:${trimmed}`;
    else if (/^[^\s/]+\.[^\s/]+/.test(trimmed)) candidate = `https://${trimmed}`;
    else return null;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Stable key for deduplicating the same posting (case/spacing-insensitive). */
export function jobKey(company: string, title: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return `${norm(company)}::${norm(title)}`;
}

/** Makes a string safe to use as a download filename on every OS. */
export function safeFilename(name: string, fallback = "resume"): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  return cleaned || fallback;
}

/** Coerces an AI-returned fit score ("3", 2.6, "strong") into 1..3 or undefined. */
export function parseFitScore(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  if (rounded < 1) return 1;
  if (rounded > 3) return 3;
  return rounded;
}

/** Case-insensitive match of a card against a free-text board filter. */
export function matchesBoardQuery(
  job: { job_title: string; company: string; location?: string | null; notes?: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [job.job_title, job.company, job.location ?? "", job.notes ?? ""].some((field) =>
    field.toLowerCase().includes(q),
  );
}

/** Escapes LIKE/ILIKE wildcards so a value is matched literally. */
export function escapeLike(value: string): string {
  return value.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Days after applying with no movement before we nudge the user to follow up. */
export const FOLLOW_UP_AFTER_DAYS = 7;

/**
 * True when a card has sat in applied/viewed for FOLLOW_UP_AFTER_DAYS or more
 * since the last change, the point where a polite follow-up email helps.
 */
export function needsFollowUp(
  job: { status: string; applied_at?: string | null; updated_at?: string | null },
  now: Date = new Date(),
): boolean {
  if (job.status !== "applied" && job.status !== "viewed") return false;
  const ref = job.updated_at || job.applied_at;
  if (!ref) return false;
  const t = new Date(ref).getTime();
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t >= FOLLOW_UP_AFTER_DAYS * 24 * 60 * 60 * 1000;
}
