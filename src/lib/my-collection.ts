/**
 * Pure helpers shared by the My Collection pages (session list, board, stats,
 * discover). Kept free of React/Supabase so they can be unit tested.
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

/** Statuses that can only be reached after an application was submitted. */
const POST_APPLY_STATUSES: ReadonlySet<string> = new Set([
  "applied",
  "viewed",
  "interview",
  "take_home",
  "offer",
]);

/** Statuses that count as a positive employer response. */
const RESPONSE_STATUSES: ReadonlySet<string> = new Set(["interview", "take_home", "offer"]);

export const SESSION_TABS = ["discover", "resumes", "board", "inbox", "stats"] as const;
export type SessionTab = (typeof SESSION_TABS)[number];

export function isSessionTab(value: string | null | undefined): value is SessionTab {
  return !!value && (SESSION_TABS as readonly string[]).includes(value);
}

/** True when moving a card into `status` means the user has applied. */
export function isPostApplyStatus(status: string): boolean {
  return POST_APPLY_STATUSES.has(status);
}

export interface TrackedJobStatRow {
  status: string;
  applied_at?: string | null;
}

export interface CollectionStats {
  total: number;
  saved: number;
  /** Every card that has been applied to, including ones that moved on. */
  applied: number;
  /** Interview + take-home stages. */
  interviews: number;
  offers: number;
  rejected: number;
  /** % of applications that got an interview/take-home/offer, or null if none applied. */
  responseRate: number | null;
}

/**
 * Funnel stats for a set of tracked jobs. "Applied" is cumulative: a card in
 * Interview or Offer was applied to as well, and a rejected/withdrawn card
 * with an applied_at timestamp still counts as an application. Counting only
 * the literal "applied" column made the response rate exceed 100%.
 */
export function computeCollectionStats(rows: readonly TrackedJobStatRow[]): CollectionStats {
  let saved = 0;
  let applied = 0;
  let interviews = 0;
  let offers = 0;
  let rejected = 0;
  let responded = 0;

  for (const row of rows) {
    const s = row.status;
    if (s === "saved") saved++;
    if (s === "interview" || s === "take_home") interviews++;
    if (s === "offer") offers++;
    if (s === "rejected") rejected++;
    if (POST_APPLY_STATUSES.has(s) || !!row.applied_at) applied++;
    if (RESPONSE_STATUSES.has(s)) responded++;
  }

  return {
    total: rows.length,
    saved,
    applied,
    interviews,
    offers,
    rejected,
    responseRate: applied > 0 ? Math.round((responded / applied) * 100) : null,
  };
}

/**
 * Returns a safe http(s) URL for use in an href, or null. Job URLs come from
 * AI output and user input, so `javascript:`/`data:` schemes must never reach
 * an anchor. Bare domains ("stripe.com/jobs/1") get https:// prepended.
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
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

/** Case/whitespace-insensitive identity for a job, used to avoid duplicate cards. */
export function jobIdentityKey(company: string, title: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return `${norm(company)}::${norm(title)}`;
}

/** Coerces an AI-provided fit score ("3", 2.7, "strong") into 1-3, or undefined. */
export function normalizeFitScore(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.min(3, Math.max(1, Math.round(n)));
}

/** Splits a comma/newline separated list, trimming and dropping blanks and duplicates. */
export function parseList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,\n]/)) {
    const v = part.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** Parses a compensation input ("120,000", "$150k") into a positive integer or null. */
export function parseCompTarget(text: string): number | null {
  const cleaned = text.trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(k)?$/);
  if (!match) return null;
  const n = Number(match[1]) * (match[2] ? 1000 : 1);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Makes a string safe to use as a download filename on every OS. */
export function safeFilename(name: string, fallback = "resume"): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 120)
    .trim();
  return cleaned || fallback;
}

/**
 * Applies an AI rewrite to a markdown line while keeping its list marker /
 * indentation, so accepting a suggestion for "- Built X" doesn't silently
 * turn the bullet into a plain paragraph.
 */
export function preserveLinePrefix(originalLine: string, suggestion: string): string {
  const prefix = originalLine.match(/^(\s*(?:[-*+]|\d+[.)])\s+)/)?.[1];
  const text = suggestion.trim();
  if (!prefix) {
    const indent = originalLine.match(/^\s*/)?.[0] ?? "";
    return indent + text;
  }
  // Suggestion already carries its own marker, keep the original indent only.
  if (/^(?:[-*+]|\d+[.)])\s+/.test(text)) {
    return (originalLine.match(/^\s*/)?.[0] ?? "") + text;
  }
  return prefix + text;
}

/** Escapes LIKE/ILIKE wildcards so a company like "100%_Remote" matches literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
