import { describe, expect, it } from "vitest";
import {
  firstAutomationTaskOutcome,
  hasApplicationEvidence,
  isAgentRunLive,
  resolveAutomationDraftState,
} from "@/lib/application-funnel";

describe("application funnel truth", () => {
  it("counts an application timestamp even when the card is on hold", () => {
    expect(hasApplicationEvidence({ status: "hold", applied_at: "2026-07-24T12:00:00Z" })).toBe(true);
  });

  it.each(["applied", "viewed", "interview", "take_home", "offer", "rejected", "withdrawn"])(
    "counts the advanced %s status even for an older row without applied_at",
    (status) => {
      expect(hasApplicationEvidence({ status, applied_at: null })).toBe(true);
    },
  );

  it.each(["discovered", "saved", "hold"])(
    "does not count a pre-application %s card without submission evidence",
    (status) => {
      expect(hasApplicationEvidence({ status, applied_at: null })).toBe(false);
    },
  );
});

describe("auto-apply evidence truth", () => {
  it("counts a submission only when an immutable receipt exists", () => {
    expect(resolveAutomationDraftState({
      draftStatus: "submitted",
      taskStatus: "completed",
      hasSubmissionReceipt: false,
    })).toBe("failed");
    expect(resolveAutomationDraftState({
      draftStatus: "ready",
      taskStatus: null,
      hasSubmissionReceipt: true,
    })).toBe("submitted");
  });

  it.each(["pending", "running"])(
    "keeps a queued draft in line while its task is %s",
    (taskStatus) => {
      expect(resolveAutomationDraftState({
        draftStatus: "queued",
        taskStatus,
        hasSubmissionReceipt: false,
      })).toBe("queued");
    },
  );

  it.each([null, "failed", "completed", "canceled", "cancelled", "dead_letter"])(
    "does not present a stale queued draft as active when its task is %s",
    (taskStatus) => {
      expect(resolveAutomationDraftState({
        draftStatus: "queued",
        taskStatus,
        hasSubmissionReceipt: false,
      })).toBe("failed");
    },
  );

  it.each(["skipped", "stopped"])(
    "uses terminal worker outcome %s when draft sync left the packet mutable",
    (taskOutcome) => {
      expect(resolveAutomationDraftState({
        draftStatus: "ready",
        taskStatus: "completed",
        taskOutcome,
        hasSubmissionReceipt: false,
      })).toBe("skipped");
    },
  );

  it("does not trust a worker submitted outcome without a durable receipt", () => {
    expect(resolveAutomationDraftState({
      draftStatus: "ready",
      taskStatus: "completed",
      taskOutcome: "submitted",
      hasSubmissionReceipt: false,
    })).toBe("failed");
  });
});

describe("automation task outcome parsing", () => {
  it("reads the first per-job outcome", () => {
    expect(firstAutomationTaskOutcome({ jobs: [{ status: "Needs_Attention" }] })).toBe("needs_attention");
  });

  it("returns null for missing or malformed results", () => {
    expect(firstAutomationTaskOutcome(null)).toBeNull();
    expect(firstAutomationTaskOutcome({ jobs: [] })).toBeNull();
    expect(firstAutomationTaskOutcome({ jobs: "skipped" })).toBeNull();
  });
});

describe("agent run liveness", () => {
  const nowMs = new Date("2026-07-24T12:00:00Z").getTime();

  it("requires both a recent running row and a recent worker heartbeat", () => {
    expect(isAgentRunLive({
      status: "running",
      startedAt: "2026-07-24T11:55:00Z",
      workerHeartbeatAt: "2026-07-24T11:59:30Z",
      nowMs,
    })).toBe(true);
  });

  it("does not treat an hours-old running row as active", () => {
    expect(isAgentRunLive({
      status: "running",
      startedAt: "2026-07-24T08:00:00Z",
      workerHeartbeatAt: "2026-07-24T11:59:30Z",
      nowMs,
    })).toBe(false);
  });

  it("does not treat a recent run as active after the worker heartbeat expires", () => {
    expect(isAgentRunLive({
      status: "running",
      startedAt: "2026-07-24T11:55:00Z",
      workerHeartbeatAt: "2026-07-24T11:56:00Z",
      nowMs,
    })).toBe(false);
  });
});
