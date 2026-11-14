/**
 * Pure helpers shared by the My Collection feature (session list, Board,
 * Stats, Discover, Resumes). Kept free of React/Supabase so they can be
 * unit-tested directly.
 */

/** Maximum number of sessions a user can have active at once. */
export const MC_ACTIVE_SESSION_LIMIT = 5;

/** Board statuses that can only be reached after the user has applied. */
const POST_APPLY_STATUSES = new Set(["applied", "viewed", "interview", "take_home", "offer"]);
const INTERVIEW_STATUSES = new Set(["interview", "take_home"]);

export interface FunnelRow {
  status: string;
  applied_at?: string | null;
}

export interface SessionFunnel {
  /** Every live card on the board. */
  total: number;
  saved: number;
  /** Cards the user has applied to, including ones that have since moved on
   *  to Interview / Offer / Rejected. */
  applied: number;
  /** Interview + take-home. */
  interviews: number;
  offers: number;
  rejected: number;
  /** % of applications that got an interview or offer, null when nothing applied. */
  responseRate: number | null;
}

/**
 * Computes the application funnel for a set of board cards.
 *
 * Counting only `status === "applied"` (the previous behaviour) dropped every
 * card that progressed past Applied, so a session with 1 card in Applied and
 * 3 in Interview showed "Applied: 1" and a 300% response rate.
 */
export function computeSessionFunnel(rows: FunnelRow[]): SessionFunnel {
  let saved = 0;
  let applied = 0;
  let interviews = 0;
  let offers = 0;
  let rejected = 0;

  for (const r of rows) {
    const hasApplied = POST_APPLY_STATUSES.has(r.status) || !!r.applied_at;
    if (r.status === "saved") saved++;
    if (hasApplied) applied++;
    if (INTERVIEW_STATUSES.has(r.status)) interviews++;
    if (r.status === "offer") offers++;
    if (r.status === "rejected") rejected++;
  }

  const responded = interviews + offers;
  const responseRate = applied > 0 ? Math.min(100, Math.round((responded / applied) * 100)) : null;

  return { total: rows.length, saved, applied, interviews, offers, rejected, responseRate };
}

/**
 * Returns the URL only if it is an absolute http(s) link, otherwise null.
 * Job links come from AI output and user input, so anything rendered as an
 * <a href> must be checked to keep `javascript:` / `data:` URLs out.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let candidate = raw.trim();
  if (!candidate) return null;
  // Accept bare domains like "jobs.lever.co/acme/123" by assuming https.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate) && /^[\w-]+(\.[\w-]+)+(\/|$)/.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Coerces an AI-provided fit score ("3", 2.6, "strong") into 1–3 or undefined. */
export function normalizeFitScore(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.min(3, Math.max(1, Math.round(n)));
}

/** Stable identity for a discovered job, case/whitespace-insensitive. */
export function jobKey(company: string, title: string): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(company)}::${norm(title)}`;
}

/**
 * Drops duplicate postings (same company + title) and orders by fit score,
 * strongest first. Unscored jobs go last; ties keep the AI's original order.
 */
export function dedupeAndRankJobs<T extends { company: string; title: string; fit_score?: number }>(
  jobs: T[],
): T[] {
  const seen = new Set<string>();
  const unique: { job: T; idx: number }[] = [];
  jobs.forEach((job, idx) => {
    const key = jobKey(job.company, job.title);
    if (seen.has(key)) return;
    seen.add(key);
    unique.push({ job, idx });
  });
  return unique
    .sort((a, b) => (b.job.fit_score ?? 0) - (a.job.fit_score ?? 0) || a.idx - b.idx)
    .map((u) => u.job);
}

/** Makes a string safe to use as a download filename on every OS. */
export function sanitizeFilename(name: string, fallback = "resume"): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, " ")
    .replace(/\.{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  return cleaned || fallback;
}

/** Case-insensitive match of a board card against a free-text filter. */
export function matchesJobFilter(
  job: { job_title: string; company: string; location?: string | null; notes?: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [job.job_title, job.company, job.location ?? "", job.notes ?? ""].some((f) =>
    f.toLowerCase().includes(q),
  );
}

/**
 * Splits a markdown line into its structural prefix (indent, list marker,
 * heading hashes) and the text body, e.g. "  - Led X" → ["  - ", "Led X"].
 */
export function splitMarkdownLinePrefix(line: string): { prefix: string; body: string } {
  const m = line.match(/^(\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)?)(.*)$/s);
  return { prefix: m?.[1] ?? "", body: m?.[2] ?? line };
}

/**
 * Replaces a markdown line's text with an AI suggestion while keeping the
 * line's original list marker / heading prefix, and stripping any marker or
 * wrapping quotes the AI added itself.
 */
export function applyLineSuggestion(originalLine: string, suggestion: string): string {
  const { prefix } = splitMarkdownLinePrefix(originalLine);
  const cleaned = splitMarkdownLinePrefix(suggestion.trim())
    .body.trim()
    .replace(/^["“](.*)["”]$/s, "$1")
    .trim();
  return `${prefix}${cleaned.replace(/\s*\n\s*/g, " ")}`;
}
