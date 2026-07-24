import { firstAutomationTaskOutcome, resolveAutomationDraftState } from "@/lib/application-funnel";

/**
 * apply-progress-core — pure, component-free status derivation for
 * ApplyProgressModal (mirrors how tailoring-report-core.ts is shared).
 * Kept separate so the modal file only exports components (react-refresh)
 * and the logic stays unit-testable.
 */

export interface ApplyProgressJob {
  evaluationId: string;
  title: string;
  company: string;
}

export type ApplyStep =
  | "tailoring"      // no draft yet — the tailor is rewriting the résumé
  | "applying"       // queued/running — the worker is on the employer's form
  | "applied"        // ✅ receipt confirmed
  | "needs_you"      // 🟠 failed — one answer/input is missing
  | "couldnt_apply"  // 🔴 skipped/blocked or the tailor itself failed
  | "ready";         // ✓ prepared, waiting for review (review-mode terminal)

export interface ApplyStepInfo {
  step: ApplyStep;
  terminal: boolean;
  reason: string | null;
  draftId: string | null;
  submittedAt: string | null;
}

export interface ApplyDraftRow {
  id: string;
  evaluation_id: string | null;
  status: string;
  error_message: string | null;
  submitted_at: string | null;
  applypass_task_id: string | null;
}

export interface ApplyTaskRow {
  id: string;
  status: string;
  error_message: string | null;
  result?: unknown;
  run_log: unknown;
}

export interface ApplyReceiptRow {
  draft_application_id: string;
  submitted_at: string;
}

/** One short, plain-English reason a user can act on. */
export function shortReason(message: string | null | undefined, fallback: string): string {
  if (!message) return fallback;
  const first = message.split(/[.\n]/)[0]?.trim() ?? "";
  if (!first) return fallback;
  return first.length > 110 ? `${first.slice(0, 107)}…` : first;
}

/** Last human-readable line the apply worker logged, if any. */
export function lastLogMessage(task: Pick<ApplyTaskRow, "run_log"> | null | undefined): string | null {
  if (!task || !Array.isArray(task.run_log)) return null;
  const entry = [...(task.run_log as Array<Record<string, unknown>>)]
    .reverse()
    .find((item) => typeof item?.message === "string");
  return entry ? String(entry.message) : null;
}

/**
 * Pure status derivation. `error` is an orchestration failure (the tailor
 * threw before a draft existed) and wins over everything else.
 */
export function deriveApplyStep(
  draft: Pick<ApplyDraftRow, "id" | "status" | "error_message" | "submitted_at" | "applypass_task_id"> | null | undefined,
  task: Pick<ApplyTaskRow, "status" | "error_message" | "result"> | null | undefined,
  receipt: Pick<ApplyReceiptRow, "submitted_at"> | null | undefined,
  error: string | null | undefined,
): ApplyStepInfo {
  if (draft && receipt) {
    return { step: "applied", terminal: true, reason: null, draftId: draft.id, submittedAt: receipt.submitted_at };
  }
  if (error) {
    return { step: "couldnt_apply", terminal: true, reason: shortReason(error, "The résumé could not be tailored."), draftId: draft?.id ?? null, submittedAt: null };
  }
  if (!draft) {
    return { step: "tailoring", terminal: false, reason: null, draftId: null, submittedAt: null };
  }

  const state = resolveAutomationDraftState({
    draftStatus: draft.status,
    taskStatus: task?.status,
    taskOutcome: firstAutomationTaskOutcome(task?.result),
    hasSubmissionReceipt: Boolean(receipt),
  });

  if (state === "submitted") {
    return { step: "applied", terminal: true, reason: null, draftId: draft.id, submittedAt: receipt?.submitted_at ?? null };
  }
  if (state === "queued") {
    return { step: "applying", terminal: false, reason: null, draftId: draft.id, submittedAt: null };
  }
  if (state === "failed") {
    const fallback = draft.status === "submitted"
      ? "No confirmed submission receipt was recorded."
      : draft.status === "queued"
        ? "The submission task ended without a confirmed receipt."
        : "One answer is missing — open it to finish.";
    return {
      step: "needs_you",
      terminal: true,
      reason: shortReason(draft.error_message ?? task?.error_message, fallback),
      draftId: draft.id,
      submittedAt: null,
    };
  }
  if (state === "skipped") {
    return { step: "couldnt_apply", terminal: true, reason: shortReason(draft.error_message, "We held this one back — open it to see why."), draftId: draft.id, submittedAt: null };
  }

  if (draft.status === "draft") {
    return { step: "tailoring", terminal: false, reason: null, draftId: draft.id, submittedAt: null };
  }

  // Ready but not queued (review mode): terminal for this run.
  return { step: "ready", terminal: true, reason: null, draftId: draft.id, submittedAt: null };
}
