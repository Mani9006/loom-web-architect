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

export const BOARD_COLUMNS: { id: TrackedStatus; label: string; tone: string }[] = [
  { id: "discovered", label: "Discovered", tone: "bg-rp-paper text-slate-700" },
  { id: "saved", label: "Saved", tone: "bg-blue-50 text-blue-700" },
  { id: "applied", label: "Applied", tone: "bg-indigo-50 text-indigo-700" },
  { id: "viewed", label: "Viewed", tone: "bg-purple-50 text-purple-700" },
  { id: "interview", label: "Interview", tone: "bg-amber-50 text-amber-700" },
  { id: "take_home", label: "Take-home", tone: "bg-orange-50 text-orange-700" },
  { id: "offer", label: "Offer", tone: "bg-emerald-50 text-emerald-700" },
  { id: "hold", label: "Hold", tone: "bg-rp-paper text-rp-ink-2" },
  { id: "rejected", label: "Rejected", tone: "bg-red-50 text-red-700" },
  { id: "withdrawn", label: "Withdrawn", tone: "bg-slate-100 text-slate-600" },
];

/** Statuses a card can only reach after an application was actually sent. */
const POST_APPLY_STATUSES = new Set<string>([
  "applied",
  "viewed",
  "interview",
  "take_home",
  "offer",
  "rejected",
  "withdrawn",
]);

/** Statuses that represent an employer response to an application. */
const RESPONDED_STATUSES = new Set<string>(["viewed", "interview", "take_home", "offer"]);

export function isPostApplyStatus(status: string): boolean {
  return POST_APPLY_STATUSES.has(status);
}

export interface JobStatusFacts {
  status: string;
  applied_at?: string | null;
}

/**
 * Counting `status === 'applied'` undercounts, a card that moved on to
 * Interview is no longer "applied" but the application was still sent.
 * `applied_at` is the durable record; the status check covers rows stamped
 * before that column was written on every transition.
 */
export function hasApplied(job: JobStatusFacts): boolean {
  return Boolean(job.applied_at) || POST_APPLY_STATUSES.has(job.status);
}

export function hasResponded(job: JobStatusFacts): boolean {
  return RESPONDED_STATUSES.has(job.status);
}

export interface SessionTotals {
  onBoard: number;
  applied: number;
  interviews: number;
  offers: number;
  rejected: number;
  /** Share of sent applications that drew any employer response, or null. */
  responseRate: number | null;
}

export function summarizeJobs(jobs: JobStatusFacts[]): SessionTotals {
  const applied = jobs.filter(hasApplied).length;
  const responded = jobs.filter(hasResponded).length;
  return {
    onBoard: jobs.length,
    applied,
    interviews: jobs.filter((j) => j.status === "interview" || j.status === "take_home").length,
    offers: jobs.filter((j) => j.status === "offer").length,
    rejected: jobs.filter((j) => j.status === "rejected").length,
    responseRate: applied > 0 ? Math.round((responded / applied) * 100) : null,
  };
}
