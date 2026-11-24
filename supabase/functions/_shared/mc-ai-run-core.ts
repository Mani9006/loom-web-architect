/**
 * Pure helpers for the mc-ai-run edge function (My Collection cloud AI
 * runner). Kept free of Deno/network imports so vitest can cover them.
 */

export type McJobKind =
  | "tailor"
  | "score_job"
  | "classify_email"
  | "company_research"
  | "rewrite_line"
  | "test"
  | "other";

export type McUsageKind = "tailor" | "evaluation" | "search";

/** Map a queued job to the daily-cap bucket it should count against. */
export function usageKindFor(kind: string, feature?: unknown): McUsageKind {
  if (kind === "tailor") return "tailor";
  if (feature === "find_jobs") return "search";
  return "evaluation";
}

/** Model tier per job: sonnet-class jobs get the standard tier. */
export function tierFor(kind: string, model: string | null | undefined): "lite" | "standard" {
  if (kind === "tailor") return "standard";
  return typeof model === "string" && model.startsWith("sonnet") ? "standard" : "lite";
}

export function maxTokensFor(kind: string): number {
  if (kind === "tailor") return 4000;
  if (kind === "company_research") return 1500;
  return 2000;
}

export interface FindJobsInput {
  target_roles: string[];
  target_locations: string[];
  remote_only: boolean;
}

function stringList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

export function parseFindJobsInput(input: unknown): FindJobsInput {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    target_roles: stringList(o.target_roles, 3),
    target_locations: stringList(o.target_locations, 5),
    remote_only: o.remote_only === true,
  };
}

export interface CandidateJob {
  title: string;
  company: string;
  location: string;
  description: string;
  apply_url: string;
}

export interface FoundJobOut {
  title: string;
  company: string;
  location?: string;
  apply_url?: string;
  summary?: string;
  description?: string;
  fit_score?: number;
  fit_reason?: string;
}

/** Cap stored posting text so sessionStorage / DB rows stay small. */
export const MAX_DESCRIPTION_CHARS = 4000;

export interface FitScore {
  i: number;
  fit_score?: number;
  fit_reason?: string;
  summary?: string;
}

/**
 * Keep listings matching any target location. Remote listings always pass
 * (they are workable from anywhere); with no targets everything passes.
 */
export function filterByLocations<T extends { location: string }>(
  jobs: T[],
  locations: string[],
  remoteOnly: boolean,
): T[] {
  if (remoteOnly || locations.length === 0) return jobs;
  const wanted = locations.map((l) => l.toLowerCase());
  return jobs.filter((j) => {
    const loc = (j.location || "").toLowerCase();
    if (!loc || /\bremote\b/.test(loc)) return true;
    return wanted.some((w) => loc.includes(w) || /\bremote\b/.test(w));
  });
}

/** Dedupe listings by apply URL, then by title+company. */
export function dedupeCandidates(jobs: CandidateJob[]): CandidateJob[] {
  const seen = new Set<string>();
  const out: CandidateJob[] = [];
  for (const j of jobs) {
    const urlKey = (j.apply_url || "").trim().toLowerCase();
    const tcKey = `${j.title}::${j.company}`.trim().toLowerCase();
    if ((urlKey && seen.has(urlKey)) || seen.has(tcKey)) continue;
    if (urlKey) seen.add(urlKey);
    seen.add(tcKey);
    out.push(j);
  }
  return out;
}

/**
 * Merge LLM fit scores onto real listings. Listings the model rated 0 /
 * irrelevant are dropped; unscored listings are kept (score unknown) so a
 * flaky scoring call never hides real jobs. Sorted strongest fit first.
 */
export function mergeFitScores(jobs: CandidateJob[], scores: FitScore[] | null, limit = 25): FoundJobOut[] {
  const byIndex = new Map<number, FitScore>();
  for (const s of scores ?? []) {
    if (s && Number.isInteger(s.i)) byIndex.set(s.i, s);
  }
  const merged = jobs.map((j, i) => {
    const s = byIndex.get(i);
    const raw = typeof s?.fit_score === "number" ? Math.round(s.fit_score) : undefined;
    const fit = raw === undefined ? undefined : Math.max(0, Math.min(3, raw));
    const fallbackSummary = j.description.replace(/\s+/g, " ").trim().slice(0, 220);
    return {
      job: {
        title: j.title,
        company: j.company,
        location: j.location || undefined,
        apply_url: j.apply_url || undefined,
        summary: (s?.summary && String(s.summary).trim()) || fallbackSummary || undefined,
        description: j.description ? j.description.trim().slice(0, MAX_DESCRIPTION_CHARS) : undefined,
        fit_score: fit && fit > 0 ? fit : undefined,
        fit_reason: s?.fit_reason ? String(s.fit_reason).trim() : undefined,
      } as FoundJobOut,
      rank: fit === undefined ? 1.5 : fit,
      i,
    };
  });
  return merged
    .filter((m) => m.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.i - b.i)
    .slice(0, limit)
    .map((m) => m.job);
}
