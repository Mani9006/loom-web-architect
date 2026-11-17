/**
 * Pure helpers shared by the My Collection workspace (sessions, board,
 * discover, stats). Kept framework-free so they can be unit tested.
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

/** Statuses that imply the candidate already submitted an application. */
const APPLIED_OR_LATER = new Set<string>(["applied", "viewed", "interview", "take_home", "offer", "rejected"]);

/** Statuses that mean the employer responded with a next step. */
const INTERVIEW_OR_LATER = new Set<string>(["interview", "take_home", "offer"]);

export interface FunnelRow {
  status: string;
  applied_at?: string | null;
}

export interface Funnel {
  /** Cards currently on the board. */
  total: number;
  /** Cards currently sitting in "saved". */
  saved: number;
  /** Cards that were ever applied to (applied, or any later stage). */
  applied: number;
  /** Cards that reached an interview / take-home / offer stage. */
  interviews: number;
  offers: number;
  rejected: number;
  /** interviews / applied as a whole percentage, or null with no applications. */
  responseRate: number | null;
}

/**
 * Computes pipeline counts. "Applied" is cumulative: a card that moved on to
 * Interview or Offer still counts as an application, so the response rate can
 * never exceed 100%.
 */
export function computeFunnel(rows: FunnelRow[]): Funnel {
  let saved = 0;
  let applied = 0;
  let interviews = 0;
  let offers = 0;
  let rejected = 0;
  for (const row of rows) {
    if (row.status === "saved") saved++;
    if (row.status === "offer") offers++;
    if (row.status === "rejected") rejected++;
    if (INTERVIEW_OR_LATER.has(row.status)) interviews++;
    if (APPLIED_OR_LATER.has(row.status) || row.applied_at) applied++;
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
 * Returns the URL only if it is an absolute http(s) URL, so AI- or
 * user-supplied links can never become `javascript:` / `data:` hrefs.
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Normalizes what a user typed into an "Apply URL" field. Adds https:// when
 * the scheme is missing ("stripe.com/jobs/123"). Returns:
 *   - { ok: true, url: null } for blank input
 *   - { ok: true, url } for a usable http(s) link
 *   - { ok: false } when the value can't be a web link
 */
export function normalizeApplyUrl(input: string): { ok: true; url: string | null } | { ok: false } {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, url: null };
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
  const safe = safeExternalUrl(candidate);
  if (!safe) return { ok: false };
  // Require a dotted hostname (or localhost) so "asdf" isn't accepted.
  const host = new URL(safe).hostname;
  if (!host.includes(".") && host !== "localhost") return { ok: false };
  return { ok: true, url: safe };
}

/** Case/whitespace-insensitive identity for a job, used for de-duplication. */
export function jobKey(company: string | null | undefined, title: string | null | undefined): string {
  const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${norm(company)}::${norm(title)}`;
}

/** Makes a string safe to use as a download filename on every OS. */
export function safeFilename(name: string, fallback = "resume"): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  return cleaned || fallback;
}

export interface DiscoveredJob {
  title: string;
  company: string;
  location?: string;
  apply_url?: string;
  summary?: string;
  fit_score?: number;
  fit_reason?: string;
}

export type DiscoverParseResult =
  | { kind: "jobs"; jobs: DiscoveredJob[] }
  | { kind: "clarification"; questions: string[] }
  | { kind: "invalid" }
  | { kind: "unexpected" };

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Interprets the AI worker's response for a Discover search. Accepts a
 * structured result_json, a ```json fenced block, or a bare object/array in
 * free text. Jobs are cleaned, de-duplicated, and sorted best-fit first.
 */
export function parseDiscoverResponse(result: string | null | undefined, resultJson?: unknown): DiscoverParseResult {
  let parsed: unknown = resultJson && typeof resultJson === "object" ? resultJson : undefined;
  const text = result ?? "";

  if (parsed === undefined && text) {
    const fence = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
    if (fence) parsed = tryParse(fence[1].trim());
  }
  if (parsed === undefined && text) {
    const objMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (objMatch) parsed = tryParse(objMatch[0]);
  }
  if (parsed === undefined || parsed === null || typeof parsed !== "object") return { kind: "invalid" };

  // A bare array is treated as the jobs list.
  const obj = (Array.isArray(parsed) ? { jobs: parsed } : parsed) as Record<string, unknown>;

  if (obj.needs_clarification && Array.isArray(obj.questions)) {
    const questions = obj.questions
      .map((q) => String(q ?? "").trim())
      .filter(Boolean)
      .slice(0, 5);
    if (questions.length > 0) return { kind: "clarification", questions };
  }

  if (Array.isArray(obj.jobs)) {
    const seen = new Set<string>();
    const jobs: DiscoveredJob[] = [];
    for (const raw of obj.jobs) {
      if (!raw || typeof raw !== "object") continue;
      const j = raw as Record<string, unknown>;
      const title = String(j.title ?? "").trim();
      const company = String(j.company ?? "").trim();
      if (!title || !company) continue;
      const key = jobKey(company, title);
      if (seen.has(key)) continue;
      seen.add(key);
      const score = Number(j.fit_score);
      jobs.push({
        title,
        company,
        location: j.location ? String(j.location).trim() || undefined : undefined,
        apply_url: safeExternalUrl(j.apply_url ? String(j.apply_url) : null) ?? undefined,
        summary: j.summary ? String(j.summary).trim() || undefined : undefined,
        fit_score: Number.isFinite(score) && score > 0 ? Math.min(3, Math.max(1, Math.round(score))) : undefined,
        fit_reason: j.fit_reason ? String(j.fit_reason).trim() || undefined : undefined,
      });
    }
    // Stable sort: best fit first, unscored last.
    const ranked = jobs
      .map((job, i) => ({ job, i }))
      .sort((a, b) => (b.job.fit_score ?? 0) - (a.job.fit_score ?? 0) || a.i - b.i)
      .map(({ job }) => job);
    return { kind: "jobs", jobs: ranked };
  }

  return { kind: "unexpected" };
}

/** Case-insensitive match of a free-text query against a card's fields. */
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
