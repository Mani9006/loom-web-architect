/**
 * All-applications board: pure mapping from pipeline tables
 * (draft_applications + applypass_tasks) to the board's display taxonomy.
 *
 * Display taxonomy (owner-specified):
 *   Queued · Tailoring · Applying · Submitted · Needs you (reason) ·
 *   Couldn't apply (reason) · Job expired · Failed · Skipped
 *
 * Board tabs: All / In flight / Needs you / Failed / Skipped.
 *   - In flight  = the live pipeline: Tailoring, Queued, Applying, Submitted
 *     (Submitted stays here because the application is out with the employer
 *     awaiting their decision — the flight is not over until they respond.)
 *   - Needs you  = blocked on the user (review, employer verification, fix)
 *   - Failed     = did not go through (Couldn't apply, Job expired, Failed)
 *   - Skipped    = deliberately held back (Skipped)
 */

export type BoardTab = "all" | "in_flight" | "needs_you" | "failed" | "skipped";

export type BoardStatusKey =
  | "queued"
  | "tailoring"
  | "applying"
  | "submitted"
  | "needs_you"
  | "cant_apply"
  | "expired"
  | "failed"
  | "skipped";

export interface BoardDraft {
  id: string;
  status: string;
  error_message: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  applypass_task_id: string | null;
  tailored_resume_id: string | null;
  tailored_cv_md: string | null;
  answers: unknown;
  evaluation: {
    scanned_job: {
      title: string;
      company: { name: string } | null;
    } | null;
  } | null;
}

export interface BoardTask {
  id: string;
  status: string;
  error_message: string | null;
  result: unknown;
  created_at: string;
}

export interface BoardStatus {
  key: BoardStatusKey;
  label: string;
  /** Short plain-English reason/detail shown next to the status chip. */
  detail: string;
  tab: Exclude<BoardTab, "all">;
}

export interface BoardRow {
  draft: BoardDraft;
  status: BoardStatus;
  title: string;
  company: string;
  resumeState: "ready" | "tailoring" | "none";
  hasCoverLetter: boolean;
  /** Timestamp backing the "Applied" column (relative time in the UI). */
  activityAt: string;
}

const STATUS_LABELS: Record<BoardStatusKey, string> = {
  queued: "Queued",
  tailoring: "Tailoring",
  applying: "Applying",
  submitted: "Submitted",
  needs_you: "Needs you",
  cant_apply: "Couldn't apply",
  expired: "Job expired",
  failed: "Failed",
  skipped: "Skipped",
};

const EXPIRED_PATTERN = /no longer available|posting.?expired|job expired|has expired|position (has been )?(filled|closed)|404|410/i;
const VERIFICATION_PATTERN = /verification|verification code|one-time|otp|security code|complete the final check/i;
const EMPLOYER_BLOCK_PATTERN = /spam|captcha|blocked|login|sign in|walled|required field|required attachment|did not accept|did not confirm/i;

interface TaskJobResult {
  status?: string;
  handoffReason?: string;
  error?: string;
  submitted?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** First per-job result inside a career_ops_submit task, if present. */
export function taskJobResult(task: BoardTask | null | undefined): TaskJobResult | null {
  if (!task) return null;
  const jobs = asRecord(task.result).jobs;
  if (!Array.isArray(jobs) || jobs.length === 0) return null;
  const first = asRecord(jobs[0]);
  return {
    status: typeof first.status === "string" ? first.status : undefined,
    handoffReason: typeof first.handoffReason === "string" ? first.handoffReason : undefined,
    error: typeof first.error === "string" ? first.error : undefined,
    submitted: typeof first.submitted === "boolean" ? first.submitted : undefined,
  };
}

/** One short, plain-English reason a user can act on. */
export function shortReason(message: string | null | undefined, fallback: string): string {
  if (!message) return fallback;
  const first = message.split(/[.\n]/)[0]?.trim() ?? "";
  if (!first) return fallback;
  return first.length > 110 ? `${first.slice(0, 107)}…` : first;
}

function isExpired(message: string | null | undefined, job: TaskJobResult | null): boolean {
  return job?.handoffReason === "posting_expired" || EXPIRED_PATTERN.test(message ?? "");
}

function needsVerification(message: string | null | undefined, job: TaskJobResult | null): boolean {
  return job?.handoffReason === "employer_verification" || VERIFICATION_PATTERN.test(message ?? "");
}

function makeStatus(key: BoardStatusKey, detail: string, tab: BoardStatus["tab"]): BoardStatus {
  return { key, label: STATUS_LABELS[key], detail, tab };
}

/**
 * Derive the board status for one application packet.
 * draft_applications.status drives the lifecycle; the linked applypass_task
 * (status + per-job result) refines in-flight progress and failure reasons.
 */
export function deriveBoardStatus(draft: BoardDraft, task: BoardTask | null | undefined): BoardStatus {
  const job = taskJobResult(task);
  const reason = draft.error_message ?? job?.error ?? task?.error_message ?? null;

  switch (draft.status) {
    case "draft":
      return makeStatus("tailoring", "We're customizing your resume for this job right now.", "in_flight");

    case "queued": {
      if (task?.status === "running") {
        return makeStatus("applying", "We're on the employer's form right now.", "in_flight");
      }
      return makeStatus("queued", "In line — submission starts shortly.", "in_flight");
    }

    case "submitted":
      return makeStatus("submitted", "Receipt confirmed by the employer.", "in_flight");

    case "skipped": {
      if (isExpired(reason, job)) {
        return makeStatus("expired", "The job posting is no longer available.", "failed");
      }
      if (job?.status === "stopped") {
        return makeStatus("skipped", "Stopped before submission.", "skipped");
      }
      return makeStatus("skipped", shortReason(reason, "We held this one back — open it to see why."), "skipped");
    }

    case "failed": {
      if (isExpired(reason, job)) {
        return makeStatus("expired", "The job posting is no longer available.", "failed");
      }
      if (needsVerification(reason, job)) {
        return makeStatus("needs_you", shortReason(reason, "The employer needs one verification step from you."), "needs_you");
      }
      if (EMPLOYER_BLOCK_PATTERN.test(reason ?? "") || job?.status === "needs_attention") {
        return makeStatus("cant_apply", shortReason(reason, "The employer's form blocked this submission."), "failed");
      }
      return makeStatus("failed", shortReason(reason, "Something went wrong — open it to see what happened."), "failed");
    }

    case "ready":
    default: {
      // "ready" with no error = tailored packet waiting for the user's review.
      // "ready" with an error = the worker handed it back (needs_review) and
      // the user must finish or fix the last step.
      if (!reason) {
        return makeStatus("needs_you", "Review your tailored application.", "needs_you");
      }
      if (isExpired(reason, job)) {
        return makeStatus("expired", "The job posting is no longer available.", "failed");
      }
      if (needsVerification(reason, job)) {
        return makeStatus("needs_you", shortReason(reason, "The employer needs one verification step from you."), "needs_you");
      }
      return makeStatus("needs_you", shortReason(reason, "One step needs your input before we can finish."), "needs_you");
    }
  }
}

function resumeStateFor(draft: BoardDraft): BoardRow["resumeState"] {
  if (draft.tailored_resume_id || draft.tailored_cv_md) return "ready";
  if (draft.status === "draft") return "tailoring";
  return "none";
}

export function hasCoverLetterAnswer(answers: unknown): boolean {
  if (!Array.isArray(answers)) return false;
  return answers.some((item) => {
    if (!item || typeof item !== "object") return false;
    const question = (item as Record<string, unknown>).question;
    const answer = (item as Record<string, unknown>).answer;
    return typeof question === "string"
      && /cover (letter|note)/i.test(question)
      && typeof answer === "string"
      && answer.trim().length > 0;
  });
}

function activityTimestamp(draft: BoardDraft, task: BoardTask | null | undefined, status: BoardStatus): string {
  if (status.key === "submitted" && draft.submitted_at) return draft.submitted_at;
  if ((status.key === "queued" || status.key === "applying") && task?.created_at) return task.created_at;
  return draft.updated_at ?? draft.created_at;
}

export function toBoardRow(draft: BoardDraft, taskById: Map<string, BoardTask>): BoardRow {
  const task = draft.applypass_task_id ? taskById.get(draft.applypass_task_id) : undefined;
  const status = deriveBoardStatus(draft, task);
  const job = draft.evaluation?.scanned_job ?? null;
  return {
    draft,
    status,
    title: job?.title ?? "Untitled role",
    company: job?.company?.name ?? "Unknown company",
    resumeState: resumeStateFor(draft),
    hasCoverLetter: hasCoverLetterAnswer(draft.answers),
    activityAt: activityTimestamp(draft, task, status),
  };
}

export function rowMatchesTab(row: BoardRow, tab: BoardTab): boolean {
  if (tab === "all") return true;
  return row.status.tab === tab;
}

export function tabCounts(rows: BoardRow[]): Record<BoardTab, number> {
  const counts: Record<BoardTab, number> = { all: rows.length, in_flight: 0, needs_you: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    counts[row.status.tab] += 1;
  }
  return counts;
}
