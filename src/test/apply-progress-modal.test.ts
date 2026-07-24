import { describe, expect, it } from "vitest";

import { deriveApplyStep } from "@/components/agent/apply-progress-core";

const draftBase = {
  id: "draft-1",
  error_message: null as string | null,
  submitted_at: null as string | null,
  applypass_task_id: null as string | null,
};

describe("deriveApplyStep", () => {
  it("reports tailoring while no draft exists", () => {
    const info = deriveApplyStep(null, null, null, null);
    expect(info.step).toBe("tailoring");
    expect(info.terminal).toBe(false);
    expect(info.draftId).toBeNull();
  });

  it("maps an orchestration error to couldn't-apply even without a draft", () => {
    const info = deriveApplyStep(null, null, null, "Edge function returned 500. Boom");
    expect(info.step).toBe("couldnt_apply");
    expect(info.terminal).toBe(true);
    expect(info.reason).toBe("Edge function returned 500");
  });

  it("keeps a draft in tailoring and maps ready to the review terminal state", () => {
    expect(deriveApplyStep({ ...draftBase, status: "draft" }, null, null, null)).toMatchObject({
      step: "tailoring",
      terminal: false,
      draftId: "draft-1",
    });
    expect(deriveApplyStep({ ...draftBase, status: "ready" }, null, null, null)).toMatchObject({
      step: "ready",
      terminal: true,
      draftId: "draft-1",
    });
  });

  it("maps queued to non-terminal applying", () => {
    const info = deriveApplyStep(
      { ...draftBase, status: "queued", applypass_task_id: "task-1" },
      { status: "running", error_message: null },
      null,
      null,
    );
    expect(info.step).toBe("applying");
    expect(info.terminal).toBe(false);
  });

  it("maps submitted to applied only with an immutable receipt", () => {
    const info = deriveApplyStep(
      { ...draftBase, status: "submitted", submitted_at: "2026-01-01T10:00:00Z" },
      { status: "completed", error_message: null },
      { submitted_at: "2026-01-01T10:00:05Z" },
      null,
    );
    expect(info.step).toBe("applied");
    expect(info.terminal).toBe(true);
    expect(info.submittedAt).toBe("2026-01-01T10:00:05Z");
  });

  it("does not call a mutable submitted draft applied without a receipt", () => {
    const info = deriveApplyStep(
      { ...draftBase, status: "submitted", submitted_at: "2026-01-01T10:00:00Z" },
      { status: "completed", error_message: null },
      null,
      null,
    );
    expect(info.step).toBe("needs_you");
    expect(info.terminal).toBe(true);
    expect(info.reason).toMatch(/no confirmed submission receipt/i);
  });

  it("lets durable receipt evidence override a stale orchestration error", () => {
    const info = deriveApplyStep(
      { ...draftBase, status: "submitted" },
      { status: "completed", error_message: null },
      { submitted_at: "2026-01-01T10:00:05Z" },
      "A prior request timed out.",
    );
    expect(info).toMatchObject({
      step: "applied",
      terminal: true,
      submittedAt: "2026-01-01T10:00:05Z",
    });
  });

  it("ends applying when the linked task is terminal without a receipt", () => {
    const info = deriveApplyStep(
      { ...draftBase, status: "queued", applypass_task_id: "task-1" },
      { status: "failed", error_message: "Employer form timed out." },
      null,
      null,
    );
    expect(info.step).toBe("needs_you");
    expect(info.terminal).toBe(true);
    expect(info.reason).toBe("Employer form timed out");
  });

  it("maps failed to needs-you with a one-line reason", () => {
    const info = deriveApplyStep(
      { ...draftBase, status: "failed", error_message: "Work authorization question unanswered. Please fill it in." },
      null,
      null,
      null,
    );
    expect(info.step).toBe("needs_you");
    expect(info.terminal).toBe(true);
    expect(info.reason).toBe("Work authorization question unanswered");
  });

  it("falls back to the task error when the draft has none", () => {
    const info = deriveApplyStep(
      { ...draftBase, status: "failed", applypass_task_id: "task-9" },
      { status: "failed", error_message: "Form requires a portfolio URL." },
      null,
      null,
    );
    expect(info.step).toBe("needs_you");
    expect(info.reason).toBe("Form requires a portfolio URL");
  });

  it("maps skipped to couldn't-apply", () => {
    const info = deriveApplyStep({ ...draftBase, status: "skipped", error_message: "Posting expired on the employer site." }, null, null, null);
    expect(info.step).toBe("couldnt_apply");
    expect(info.terminal).toBe(true);
    expect(info.reason).toBe("Posting expired on the employer site");
  });

  it("uses a terminal skipped worker outcome when draft sync left the packet ready", () => {
    const info = deriveApplyStep(
      { ...draftBase, status: "ready" },
      { status: "completed", error_message: null, result: { jobs: [{ status: "skipped" }] } },
      null,
      null,
    );
    expect(info.step).toBe("couldnt_apply");
    expect(info.terminal).toBe(true);
  });

  it("truncates long reasons to one line", () => {
    const long = `${"x".repeat(200)}. more`;
    const info = deriveApplyStep({ ...draftBase, status: "failed", error_message: long }, null, null, null);
    expect(info.reason!.length).toBeLessThanOrEqual(110);
    expect(info.reason!.endsWith("…")).toBe(true);
  });
});
