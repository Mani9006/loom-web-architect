/**
 * Shared utilities for job search functions.
 *
 * Lives next to _shared/ai.ts + llm.ts + guards.ts. All job-search functions
 * should reuse these helpers for: date-window math, filter normalization,
 * dedup, source-allowlist enforcement.
 */

// ─── Source allowlist ─────────────────────────────────────────────────────
// Company-direct ATS hosts only. We explicitly do NOT include LinkedIn,
// Indeed, Dice, ZipRecruiter, Glassdoor, etc — those are aggregators and the
// product is positioned around direct careers pages.
export const ALLOWED_HOSTS = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com",
  "ashbyhq.com",
  "myworkdayjobs.com",
  "icims.com",
  "smartrecruiters.com",
  "jobs.smartrecruiters.com",
  "bamboohr.com",
  "workable.com",
  "jobs.workable.com",
  "rippling.com",
  "jobvite.com",
  "recruitee.com",
  "join.com",
  "personio.com",
  "teamtailor.com",
  "applytojob.com",
] as const;

const BLOCKED_HOSTS = [
  "linkedin.com",
  "indeed.com",
  "dice.com",
  "ziprecruiter.com",
  "glassdoor.com",
  "monster.com",
  "wellfound.com",
  "angel.co",
  "remoteok.com",
  "weworkremotely.com",
  "stackoverflow.com",
  "hired.com",
];

export function isAllowedApplyUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))) return false;
    // Either it's on an explicit ATS host, OR it appears to be a company-owned
    // careers page (heuristic: contains "career"/"jobs"/"work-with-us" path
    // segment on a non-blocked host).
    if (ALLOWED_HOSTS.some((a) => host === a || host.endsWith(`.${a}`))) return true;
    try {
      const path = new URL(url).pathname.toLowerCase();
      if (/^\/(careers|jobs|join|work-with-us|opportunities)\b/.test(path)) return true;
      if (/career|jobs/.test(host)) return true; // careers.foo.com, jobs.foo.com
    } catch { /* noop */ }
    return false;
  } catch {
    return false;
  }
}

// ─── Date window math ─────────────────────────────────────────────────────
// UI sends one of these tokens. We map to a real ISO cutoff so SQL filters
// (`posted_at >= cutoff`) work deterministically.
export type DateWindow = "24h" | "48h" | "today" | "3d" | "7d" | "14d" | "30d" | "any";

export function dateWindowCutoff(window: DateWindow, now: Date = new Date()): string | null {
  const ms = now.getTime();
  const day = 24 * 60 * 60 * 1000;
  switch (window) {
    case "any":   return null;
    case "today": {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case "24h":   return new Date(ms - day).toISOString();
    case "48h":   return new Date(ms - 2 * day).toISOString();
    case "3d":    return new Date(ms - 3 * day).toISOString();
    case "7d":    return new Date(ms - 7 * day).toISOString();
    case "14d":   return new Date(ms - 14 * day).toISOString();
    case "30d":   return new Date(ms - 30 * day).toISOString();
  }
}

export function dateWindowLabel(window: DateWindow): string {
  return {
    "24h": "past 24 hours",
    "48h": "past 48 hours",
    "today": "today",
    "3d": "past 3 days",
    "7d": "past 7 days",
    "14d": "past 14 days",
    "30d": "past 30 days",
    "any": "any time",
  }[window];
}

// ─── Salary parsing ───────────────────────────────────────────────────────
// Extract a numeric upper bound from a freetext salary string. Used to filter
// against a user's minimum-salary requirement.
const SAL_RX = /\$\s*([\d,.]+)\s*([kKmM]?)\b/g;
export function parseSalaryMaxUsd(s: string | null | undefined): number | null {
  if (!s) return null;
  let best: number | null = null;
  for (const m of s.matchAll(SAL_RX)) {
    let n = Number(m[1].replace(/[,$]/g, ""));
    if (!isFinite(n)) continue;
    const unit = m[2].toLowerCase();
    if (unit === "k") n *= 1_000;
    if (unit === "m") n *= 1_000_000;
    if (best === null || n > best) best = n;
  }
  return best;
}

// ─── Experience level normalization ───────────────────────────────────────
export type ExperienceLevel = "internship" | "entry" | "mid" | "senior" | "executive";

const LEVEL_TOKENS: Record<ExperienceLevel, RegExp> = {
  internship: /\b(intern|internship|co-op|coop|trainee)\b/i,
  entry:      /\b(entry|junior|jr\.?|graduate|new grad|0[\s-]*[12] (?:years|yrs))\b/i,
  mid:        /\b(mid[\s-]?level|intermediate|2[\s-]*[5] (?:years|yrs)|3\+? (?:years|yrs))\b/i,
  senior:     /\b(senior|sr\.?|staff|principal|lead|5\+? (?:years|yrs)|6\+? (?:years|yrs)|7\+? (?:years|yrs)|8\+? (?:years|yrs))\b/i,
  executive:  /\b(director|vp|vice president|head of|chief|c[a-z]?o|executive)\b/i,
};

export function detectLevel(text: string): ExperienceLevel | null {
  // Check seniority order: executive first, then senior, then mid, etc.
  // (Otherwise "lead senior staff" gets matched as "lead" → senior even if
  // it's "head of platform" → should be executive.)
  for (const lvl of ["executive", "senior", "mid", "entry", "internship"] as const) {
    if (LEVEL_TOKENS[lvl].test(text)) return lvl;
  }
  return null;
}

export function levelMatches(want: ExperienceLevel | null | undefined, jobText: string): boolean {
  if (!want) return true;
  const got = detectLevel(jobText);
  if (!got) return true;            // unknown — don't filter out
  return got === want;
}

// ─── Remote/hybrid/on-site filter ─────────────────────────────────────────
export type RemoteFilter = "any" | "remote" | "hybrid" | "onsite";

export function remoteMatches(want: RemoteFilter, text: string): boolean {
  if (want === "any") return true;
  const t = text.toLowerCase();
  const isRemote = /\bremote\b|\bwork from home\b|\bwfh\b|\bremote-first\b|\bfully remote\b/i.test(t);
  const isHybrid = /\bhybrid\b/i.test(t);
  const isOnsite = /\bon[\s-]?site\b|\bin[\s-]?office\b|\bin person\b/i.test(t);
  if (want === "remote") return isRemote && !isHybrid && !isOnsite;
  if (want === "hybrid") return isHybrid;
  if (want === "onsite") return isOnsite && !isRemote && !isHybrid;
  return true;
}

// ─── Common job shape used across providers ───────────────────────────────
export interface NormalizedJob {
  id: string;            // stable id: host + path + title hash
  title: string;
  company: string;
  location: string;
  description: string;
  apply_url: string;
  source: string;        // "perplexity" | "apify:<actor>" | "greenhouse" | ...
  posted_at: string | null; // ISO if known
  salary_text: string | null;
  remote_text: string | null;
  raw?: unknown;
}

// ─── Dedup ────────────────────────────────────────────────────────────────
// Same job often shows up under both the company's careers page URL AND its
// Greenhouse/Lever URL. Key on title + company + first 60 chars of description.
export function dedupeJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Map<string, NormalizedJob>();
  for (const j of jobs) {
    const key = `${j.title.toLowerCase().trim()}::${j.company.toLowerCase().trim()}`;
    if (!seen.has(key)) seen.set(key, j);
  }
  return [...seen.values()];
}

// ─── Stable id ────────────────────────────────────────────────────────────
export async function stableJobId(j: { apply_url: string; title: string; company: string }): Promise<string> {
  const text = `${j.apply_url}::${j.title}::${j.company}`.toLowerCase();
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(hash))
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Filter pipeline ──────────────────────────────────────────────────────
// Applies all post-fetch filters in one place. Returns the filtered list +
// stats so we can log how many were dropped at each stage.
export interface FilterOptions {
  dateWindow?: DateWindow;
  minSalaryUsd?: number;
  level?: ExperienceLevel;
  remote?: RemoteFilter;
  locationContains?: string;
}

export function applyFilters(
  jobs: NormalizedJob[],
  opts: FilterOptions,
): { jobs: NormalizedJob[]; dropped: Record<string, number> } {
  const dropped: Record<string, number> = { source: 0, date: 0, salary: 0, level: 0, remote: 0, location: 0 };
  const cutoff = opts.dateWindow ? dateWindowCutoff(opts.dateWindow) : null;
  const minSal = opts.minSalaryUsd ?? null;
  const loc = (opts.locationContains ?? "").toLowerCase().trim();

  const out: NormalizedJob[] = [];
  for (const j of jobs) {
    if (!isAllowedApplyUrl(j.apply_url)) { dropped.source++; continue; }
    if (cutoff && j.posted_at && j.posted_at < cutoff) { dropped.date++; continue; }
    if (minSal && j.salary_text) {
      const max = parseSalaryMaxUsd(j.salary_text);
      if (max !== null && max < minSal) { dropped.salary++; continue; }
    }
    const haystack = `${j.title} ${j.description}`;
    if (!levelMatches(opts.level ?? null, haystack)) { dropped.level++; continue; }
    if (!remoteMatches(opts.remote ?? "any", `${j.remote_text ?? ""} ${j.description}`)) { dropped.remote++; continue; }
    if (loc && !j.location.toLowerCase().includes(loc)) { dropped.location++; continue; }
    out.push(j);
  }
  return { jobs: dedupeJobs(out), dropped };
}
