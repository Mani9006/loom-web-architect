import { describe, expect, it } from "vitest";
import {
  normalizeApplyIntent,
  normalizeHandsOffCadence,
  planEngineJob,
  shouldSchedulerEnqueue,
  uniqueEvaluationIds,
} from "@/lib/apply-engine";

describe("apply engine planner", () => {
  it("plans a live Greenhouse URL as a cloud submit", () => {
    const plan = planEngineJob({
      evaluation_id: "eval-1",
      apply_url: "https://boards.greenhouse.io/acme/jobs/1",
    });
    expect(plan.detection.ats).toBe("greenhouse");
    expect(plan.willSubmit).toBe(true);
  });

  it("plans iCIMS as Needs you, never as a fake submit", () => {
    const plan = planEngineJob({ apply_url: "https://careers-acme.icims.com/jobs/1/job" });
    expect(plan.detection.detected).toBe(true);
    expect(plan.willSubmit).toBe(false);
    expect(plan.detection.mode).toBe("needs_you");
  });

  it("defaults intent to user_selected", () => {
    expect(normalizeApplyIntent("hands_off")).toBe("hands_off");
    expect(normalizeApplyIntent("anything")).toBe("user_selected");
  });

  it("dedupes evaluation ids and caps the batch", () => {
    expect(uniqueEvaluationIds(["a", "a", "b", 1, ""])).toEqual(["a", "b"]);
    expect(uniqueEvaluationIds(Array.from({ length: 80 }, (_, i) => String(i)))).toHaveLength(50);
  });

  it("gates hands-off enqueue on kill switch, cadence, and daily batch", () => {
    expect(normalizeHandsOffCadence("daily")).toBe("daily");
    expect(normalizeHandsOffCadence("nope")).toBe("hourly");
    expect(shouldSchedulerEnqueue({
      cadence: "hourly", autoApplyEnabled: true, agentEnabled: true, handsOffQueuedToday: 3,
    })).toBe(true);
    expect(shouldSchedulerEnqueue({
      cadence: "daily", autoApplyEnabled: true, agentEnabled: true, handsOffQueuedToday: 1,
    })).toBe(false);
    expect(shouldSchedulerEnqueue({
      cadence: "off", autoApplyEnabled: true, agentEnabled: true, handsOffQueuedToday: 0,
    })).toBe(false);
    expect(shouldSchedulerEnqueue({
      cadence: "hourly", autoApplyEnabled: false, agentEnabled: true, handsOffQueuedToday: 0,
    })).toBe(false);
  });
});
