import { describe, expect, it } from "vitest";
import {
  deriveBoardStatus,
  hasCoverLetterAnswer,
  tabCounts,
  taskJobResult,
  toBoardRow,
  withAutomationEvidence,
  type BoardDraft,
  type BoardTask,
} from "@/lib/application-board";
import { resolveAutomationDraftState } from "@/lib/application-funnel";

function draft(overrides: Partial<BoardDraft> = {}): BoardDraft {
  return {
    id: "draft-1",
    status: "ready",
    error_message: null,
    submitted_at: null,
    created_at: "2026-02-20T10:00:00Z",
    updated_at: "2026-02-20T12:00:00Z",
    applypass_task_id: null,
    tailored_resume_id: "resume-1",
    tailored_cv_md: "# Tailored",
    answers: [],
    evaluation: { scanned_job: { title: "Frontend Engineer", company: { name: "Acme" } } },
    ...overrides,
  };
}

function task(overrides: Partial<BoardTask> = {}): BoardTask {
  return {
    id: "task-1",
    status: "pending",
    error_message: null,
    result: null,
    created_at: "2026-02-20T11:00:00Z",
    ...overrides,
  };
}

describe("deriveBoardStatus", () => {
  it("maps an in-progress packet to Tailoring (in flight)", () => {
    const status = deriveBoardStatus(draft({ status: "draft", tailored_resume_id: null, tailored_cv_md: null }), null);
    expect(status.key).toBe("tailoring");
    expect(status.label).toBe("Tailoring");
    expect(status.tab).toBe("in_flight");
  });

  it("maps queued without a running task to Queued", () => {
    const status = deriveBoardStatus(draft({ status: "queued", applypass_task_id: "task-1" }), task({ status: "pending" }));
    expect(status.key).toBe("queued");
    expect(status.tab).toBe("in_flight");
  });

  it("maps queued with a running task to Applying", () => {
    const status = deriveBoardStatus(draft({ status: "queued", applypass_task_id: "task-1" }), task({ status: "running" }));
    expect(status.key).toBe("applying");
    expect(status.label).toBe("Applying");
  });

  it("does not call a running task Applying after the worker heartbeat expires", () => {
    const status = deriveBoardStatus(
      draft({ status: "queued", applypass_task_id: "task-1" }),
      task({ status: "running", workerRecentlyActive: false }),
    );
    expect(status.key).toBe("queued");
    expect(status.detail).toMatch(/has not checked in recently/i);
  });

  it("maps queued with no active task to Failed after evidence reconciliation", () => {
    const queuedDraft = draft({ status: "queued" });
    const state = resolveAutomationDraftState({
      draftStatus: queuedDraft.status,
      taskStatus: null,
      hasSubmissionReceipt: false,
    });
    const status = deriveBoardStatus(withAutomationEvidence(queuedDraft, { state }), null);
    expect(status.key).toBe("failed");
    expect(status.tab).toBe("failed");
    expect(status.detail).toMatch(/no longer in the active submission queue/i);
  });

  it("maps submitted to Submitted only with receipt evidence", () => {
    const submittedDraft = draft({ status: "submitted", submitted_at: "2026-02-20T12:30:00Z" });
    const state = resolveAutomationDraftState({
      draftStatus: submittedDraft.status,
      taskStatus: "completed",
      hasSubmissionReceipt: true,
    });
    const status = deriveBoardStatus(
      withAutomationEvidence(submittedDraft, { state, receiptSubmittedAt: "2026-02-20T12:31:00Z" }),
      null,
    );
    expect(status.key).toBe("submitted");
    expect(status.tab).toBe("in_flight");
  });

  it("maps submitted without a receipt to Failed with an honest reason", () => {
    const submittedDraft = draft({ status: "submitted", submitted_at: "2026-02-20T12:30:00Z" });
    const state = resolveAutomationDraftState({
      draftStatus: submittedDraft.status,
      taskStatus: "completed",
      hasSubmissionReceipt: false,
    });
    const status = deriveBoardStatus(withAutomationEvidence(submittedDraft, { state }), null);
    expect(status.key).toBe("failed");
    expect(status.detail).toMatch(/no confirmed submission receipt/i);
  });

  it("maps a fresh ready packet to Needs you (review)", () => {
    const status = deriveBoardStatus(draft({ status: "ready" }), null);
    expect(status.key).toBe("needs_you");
    expect(status.detail).toMatch(/review/i);
    expect(status.tab).toBe("needs_you");
  });

  it("maps a ready packet handed back by the worker to Needs you with the reason", () => {
    const status = deriveBoardStatus(
      draft({ status: "ready", error_message: "The employer did not confirm submission. Open the prepared application." }),
      task({ status: "processed", result: { jobs: [{ status: "needs_review" }] } }),
    );
    expect(status.key).toBe("needs_you");
    expect(status.detail).toMatch(/employer did not confirm/i);
  });

  it("maps employer verification handoffs to Needs you even from failed", () => {
    const status = deriveBoardStatus(
      draft({ status: "failed", error_message: "The employer verification code did not arrive in the connected inbox." }),
      null,
    );
    expect(status.key).toBe("needs_you");
    expect(status.tab).toBe("needs_you");
  });

  it("maps expired postings to Job expired via handoff reason", () => {
    const status = deriveBoardStatus(
      draft({ status: "failed", error_message: "The job posting is no longer available; skipped before filling." }),
      task({ status: "processed", result: { jobs: [{ status: "skipped", handoffReason: "posting_expired" }] } }),
    );
    expect(status.key).toBe("expired");
    expect(status.label).toBe("Job expired");
    expect(status.tab).toBe("failed");
  });

  it("maps expired postings to Job expired via message pattern alone", () => {
    const status = deriveBoardStatus(
      draft({ status: "skipped", error_message: "This position has been filled." }),
      null,
    );
    expect(status.key).toBe("expired");
  });

  it("maps employer-side blocks to Couldn't apply", () => {
    const status = deriveBoardStatus(
      draft({ status: "failed", error_message: "The employer's spam filter rejected this submission (flagged as possible spam)." }),
      task({ status: "processed", result: { jobs: [{ status: "needs_attention" }] } }),
    );
    expect(status.key).toBe("cant_apply");
    expect(status.label).toBe("Couldn't apply");
    expect(status.tab).toBe("failed");
  });

  it("maps technical failures to Failed with a short reason", () => {
    const status = deriveBoardStatus(
      draft({ status: "failed", error_message: "Worker execution failed: navigation timeout. Extra detail here." }),
      null,
    );
    expect(status.key).toBe("failed");
    expect(status.tab).toBe("failed");
    expect(status.detail).toBe("Worker execution failed: navigation timeout");
  });

  it("maps stopped submissions to Skipped", () => {
    const status = deriveBoardStatus(
      draft({ status: "skipped", error_message: "Continuous Apply was stopped before final submission." }),
      task({ status: "processed", result: { jobs: [{ status: "stopped" }] } }),
    );
    expect(status.key).toBe("skipped");
    expect(status.tab).toBe("skipped");
  });

  it("maps plain skipped drafts to Skipped with the reason", () => {
    const status = deriveBoardStatus(draft({ status: "skipped", error_message: "Daily apply cap reached." }), null);
    expect(status.key).toBe("skipped");
    expect(status.detail).toBe("Daily apply cap reached");
  });
});

describe("taskJobResult", () => {
  it("extracts the first per-job result", () => {
    const result = taskJobResult(task({ result: { jobs: [{ status: "submitted", submitted: true, handoffReason: undefined }] } }));
    expect(result?.status).toBe("submitted");
    expect(result?.submitted).toBe(true);
  });

  it("returns null for missing or malformed results", () => {
    expect(taskJobResult(null)).toBeNull();
    expect(taskJobResult(task({ result: null }))).toBeNull();
    expect(taskJobResult(task({ result: { jobs: [] } }))).toBeNull();
    expect(taskJobResult(task({ result: "nope" }))).toBeNull();
  });
});

describe("hasCoverLetterAnswer", () => {
  it("detects a cover letter answer", () => {
    expect(hasCoverLetterAnswer([{ question: "Cover letter", answer: "Dear team…" }])).toBe(true);
    expect(hasCoverLetterAnswer([{ question: "Add a cover note (optional)", answer: "Hi" }])).toBe(true);
  });

  it("is off for missing, empty, or malformed answers", () => {
    expect(hasCoverLetterAnswer([])).toBe(false);
    expect(hasCoverLetterAnswer(null)).toBe(false);
    expect(hasCoverLetterAnswer([{ question: "Cover letter", answer: "  " }])).toBe(false);
    expect(hasCoverLetterAnswer([{ question: "Years of experience", answer: "5" }])).toBe(false);
    expect(hasCoverLetterAnswer("not-an-array")).toBe(false);
  });
});

describe("toBoardRow", () => {
  it("builds a row with position, resume, cover letter, and activity time", () => {
    const row = toBoardRow(
      draft({ status: "submitted", submitted_at: "2026-02-20T13:00:00Z", answers: [{ question: "Cover letter", answer: "Hello" }] }),
      new Map(),
    );
    expect(row.title).toBe("Frontend Engineer");
    expect(row.company).toBe("Acme");
    expect(row.resumeState).toBe("ready");
    expect(row.hasCoverLetter).toBe(true);
    expect(row.activityAt).toBe("2026-02-20T13:00:00Z");
  });

  it("uses the task creation time while queued", () => {
    const row = toBoardRow(
      draft({ status: "queued", applypass_task_id: "task-1" }),
      new Map([["task-1", task({ status: "running" })]]),
    );
    expect(row.status.key).toBe("applying");
    expect(row.activityAt).toBe("2026-02-20T11:00:00Z");
  });

  it("keeps the worker's reason when terminal task evidence reconciles a stale queue", () => {
    const failedTask = task({ status: "failed", error_message: "Employer form timed out." });
    const row = toBoardRow(
      draft({ status: "queued", applypass_task_id: failedTask.id }),
      new Map([[failedTask.id, failedTask]]),
      { state: "failed" },
    );
    expect(row.status.key).toBe("failed");
    expect(row.status.detail).toBe("Employer form timed out");
  });

  it("preserves an existing draft failure reason during evidence reconciliation", () => {
    const row = toBoardRow(
      draft({ status: "failed", error_message: "Required portfolio URL was missing." }),
      new Map(),
      { state: "failed" },
    );
    expect(row.status.detail).toBe("Required portfolio URL was missing");
  });

  it("marks the resume as tailoring while the packet is a draft", () => {
    const row = toBoardRow(draft({ status: "draft", tailored_resume_id: null, tailored_cv_md: null }), new Map());
    expect(row.resumeState).toBe("tailoring");
  });

  it("falls back to placeholders for missing job data", () => {
    const row = toBoardRow(draft({ evaluation: null }), new Map());
    expect(row.title).toBe("Untitled role");
    expect(row.company).toBe("Unknown company");
  });
});

describe("tabCounts", () => {
  it("counts every row once per its primary tab plus all", () => {
    const activeTask = task({ status: "pending" });
    const rows = [
      toBoardRow(draft({ id: "a", status: "draft" }), new Map()),
      toBoardRow(
        draft({ id: "b", status: "queued", applypass_task_id: activeTask.id }),
        new Map([[activeTask.id, activeTask]]),
        { state: "queued" },
      ),
      toBoardRow(
        draft({ id: "c", status: "submitted" }),
        new Map(),
        { state: "submitted", receiptSubmittedAt: "2026-02-20T13:00:00Z" },
      ),
      toBoardRow(draft({ id: "d", status: "ready" }), new Map()),
      toBoardRow(draft({ id: "e", status: "failed", error_message: "timeout" }), new Map()),
      toBoardRow(draft({ id: "f", status: "skipped" }), new Map()),
      toBoardRow(draft({ id: "g", status: "queued" }), new Map(), { state: "failed" }),
      toBoardRow(draft({ id: "h", status: "submitted" }), new Map(), { state: "failed" }),
    ];
    expect(tabCounts(rows)).toEqual({ all: 8, in_flight: 3, needs_you: 1, failed: 3, skipped: 1 });
  });
});
