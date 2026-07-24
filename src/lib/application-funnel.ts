export interface ApplicationFunnelRow {
  status: string | null;
  applied_at: string | null;
}

/**
 * Statuses that can only be reached after an application has been submitted.
 * `hold` is intentionally excluded because a user can place a saved job on hold
 * before applying.
 */
const POST_APPLICATION_STATUSES = new Set([
  "applied",
  "viewed",
  "interview",
  "take_home",
  "offer",
  "rejected",
  "withdrawn",
]);

/**
 * A board card remains an application after it advances beyond the Applied
 * column. Older rows can also carry `applied_at` without having their current
 * status set to `applied`, so both signals are authoritative.
 */
export function hasApplicationEvidence(row: ApplicationFunnelRow): boolean {
  return Boolean(row.applied_at) || POST_APPLICATION_STATUSES.has(row.status ?? "");
}

export type AutomationDraftState = "prepared" | "queued" | "submitted" | "failed" | "skipped";

interface AutomationDraftEvidence {
  draftStatus: string | null;
  taskStatus?: string | null;
  taskOutcome?: string | null;
  hasSubmissionReceipt: boolean;
}

export function firstAutomationTaskOutcome(result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const jobs = (result as Record<string, unknown>).jobs;
  if (!Array.isArray(jobs)) return null;
  for (const job of jobs) {
    if (!job || typeof job !== "object" || Array.isArray(job)) continue;
    const status = (job as Record<string, unknown>).status;
    if (typeof status === "string" && status.trim()) return status.trim().toLowerCase();
  }
  return null;
}

/**
 * Resolve the user-visible automation state from durable evidence.
 *
 * A draft saying `queued` is not proof that work is actually queued: its task
 * can already be failed, cancelled, completed without submission, or missing.
 * Likewise, `submitted` is not counted without an immutable receipt.
 */
export function resolveAutomationDraftState({
  draftStatus,
  taskStatus,
  taskOutcome,
  hasSubmissionReceipt,
}: AutomationDraftEvidence): AutomationDraftState {
  if (hasSubmissionReceipt) return "submitted";
  const taskIsActive = taskStatus === "pending" || taskStatus === "running";
  if (draftStatus === "skipped" || (!taskIsActive && (taskOutcome === "skipped" || taskOutcome === "stopped"))) {
    return "skipped";
  }
  if (
    draftStatus === "failed"
    || draftStatus === "submitted"
    || (!taskIsActive && taskOutcome === "submitted")
  ) {
    return "failed";
  }
  if (draftStatus === "queued") {
    return taskIsActive ? "queued" : "failed";
  }
  return "prepared";
}

interface AgentRunLivenessEvidence {
  status: string | null;
  startedAt: string | null;
  workerHeartbeatAt: string | null;
  nowMs?: number;
  maxRunAgeMs?: number;
  maxHeartbeatAgeMs?: number;
}

function isRecentTimestamp(value: string | null, nowMs: number, maxAgeMs: number): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const age = nowMs - timestamp;
  return age >= 0 && age <= maxAgeMs;
}

/**
 * A mutable `agent_runs.status = running` row is only a live signal while the
 * run is recent and the submission worker is still checking in.
 */
export function isAgentRunLive({
  status,
  startedAt,
  workerHeartbeatAt,
  nowMs = Date.now(),
  maxRunAgeMs = 15 * 60_000,
  maxHeartbeatAgeMs = 90_000,
}: AgentRunLivenessEvidence): boolean {
  return status === "running"
    && isRecentTimestamp(startedAt, nowMs, maxRunAgeMs)
    && isRecentTimestamp(workerHeartbeatAt, nowMs, maxHeartbeatAgeMs);
}
