/**
 * Shared pipeline math for My Collection sessions.
 *
 * A tracked job only ever has one status, so counting "applied" as
 * `status === "applied"` undercounts: a card that moved on to Interview,
 * Offer or Rejected was still applied to. That made the Applied tile shrink
 * as a search progressed and let the response rate go over 100%.
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

export interface TrackedJobLike {
  status: string;
  applied_at?: string | null;
}

/** Statuses that can only be reached after an application went out. */
const POST_APPLY = new Set<string>(["applied", "viewed", "interview", "take_home", "offer"]);
/** Statuses that count as a positive employer response. */
const RESPONDED = new Set<string>(["interview", "take_home", "offer"]);

export function hasApplied(job: TrackedJobLike): boolean {
  return POST_APPLY.has(job.status) || Boolean(job.applied_at);
}

export interface PipelineStats {
  total: number;
  /** Everything ever applied to, whatever stage it is in now. */
  applied: number;
  /** Currently interviewing (interview + take-home). */
  interviews: number;
  offers: number;
  rejected: number;
  /** Share of applications that got an interview or offer, 0–100, or null with no applications. */
  responseRate: number | null;
  byStatus: Record<string, number>;
}

export function computePipelineStats(jobs: TrackedJobLike[]): PipelineStats {
  const byStatus: Record<string, number> = {};
  let applied = 0;
  let respondedApplied = 0;
  for (const job of jobs) {
    byStatus[job.status] = (byStatus[job.status] ?? 0) + 1;
    if (hasApplied(job)) {
      applied += 1;
      if (RESPONDED.has(job.status)) respondedApplied += 1;
    }
  }
  const count = (s: string) => byStatus[s] ?? 0;
  return {
    total: jobs.length,
    applied,
    interviews: count("interview") + count("take_home"),
    offers: count("offer"),
    rejected: count("rejected"),
    responseRate: applied > 0 ? Math.round((respondedApplied / applied) * 100) : null,
    byStatus,
  };
}

/** Case- and whitespace-insensitive identity for "same job at same company". */
export function jobIdentityKey(company: string | null | undefined, title: string | null | undefined): string {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(company)}::${norm(title)}`;
}
