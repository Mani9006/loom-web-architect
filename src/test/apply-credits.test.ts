import { describe, expect, it } from "vitest";
import {
  APPLY_ENGINE_BATCH_LIMIT,
  PLAN_CREDIT_BUCKETS,
  clampDailyApplyCap,
  creditPlanLabel,
  decideEnqueueSlot,
  effectiveDailyCap,
  engineIdempotencyKey,
  parseCreditSnapshot,
  remainingCredits,
  resolveCreditPlan,
} from "@/lib/apply-credits";

describe("apply credit buckets", () => {
  it("does not sell 500–600 applies/day on a $19 plan", () => {
    expect(PLAN_CREDIT_BUCKETS.starter.listPriceUsd).toBe(19);
    expect(PLAN_CREDIT_BUCKETS.starter.monthlyCredits).toBe(30);
    expect(PLAN_CREDIT_BUCKETS.starter.dailySubmitCap).toBe(10);
    expect(PLAN_CREDIT_BUCKETS.starter.handsOff).toBe(false);
    expect(PLAN_CREDIT_BUCKETS.pro.monthlyCredits).toBe(80);
    expect(PLAN_CREDIT_BUCKETS.autopilot.monthlyCredits).toBe(250);
    expect(PLAN_CREDIT_BUCKETS.autopilot.dailySubmitCap).toBeLessThanOrEqual(40);
  });

  it("maps premium to autopilot and unknown to free", () => {
    expect(resolveCreditPlan("starter")).toBe("starter");
    expect(resolveCreditPlan("premium")).toBe("autopilot");
    expect(resolveCreditPlan("nope")).toBe("free");
  });

  it("counts remaining as granted + refunded − consumed − reserved", () => {
    expect(remainingCredits({ granted: 80, consumed: 10, refunded: 2, reserved: 5 })).toBe(67);
    expect(remainingCredits({ granted: 0, consumed: 0, refunded: 0, reserved: 1 })).toBe(0);
  });

  it("lets unsupported ATS enqueue without occupying a credit", () => {
    const decision = decideEnqueueSlot({
      submittable: false,
      alreadySubmitted: false,
      alreadyQueued: false,
      remainingCredits: 0,
      liveQueuedInBatch: 0,
      dailyLiveUsed: 99,
      dailyLiveCap: 10,
      atsHourlyUsed: 99,
      atsHourlyCap: 8,
    });
    expect(decision.ok).toBe(true);
    expect(decision.occupiesCredit).toBe(false);
  });

  it("blocks live enqueue when credits or caps are exhausted", () => {
    expect(decideEnqueueSlot({
      submittable: true, alreadySubmitted: false, alreadyQueued: false,
      remainingCredits: 1, liveQueuedInBatch: 1, dailyLiveUsed: 0, dailyLiveCap: 10, atsHourlyUsed: 0, atsHourlyCap: 8,
    }).reason).toBe("no_credits");
    expect(decideEnqueueSlot({
      submittable: true, alreadySubmitted: false, alreadyQueued: false,
      remainingCredits: 5, liveQueuedInBatch: 0, dailyLiveUsed: 10, dailyLiveCap: 10, atsHourlyUsed: 0, atsHourlyCap: 8,
    }).reason).toBe("daily_cap");
    expect(decideEnqueueSlot({
      submittable: true, alreadySubmitted: false, alreadyQueued: false,
      remainingCredits: 5, liveQueuedInBatch: 0, dailyLiveUsed: 0, dailyLiveCap: 10, atsHourlyUsed: 8, atsHourlyCap: 8,
    }).reason).toBe("ats_rate_limit");
  });

  it("refuses a second submit of a job that already has a receipt", () => {
    expect(decideEnqueueSlot({
      submittable: true, alreadySubmitted: true, alreadyQueued: false,
      remainingCredits: 80, liveQueuedInBatch: 0, dailyLiveUsed: 0, dailyLiveCap: 20, atsHourlyUsed: 0, atsHourlyCap: 8,
    }).reason).toBe("already_submitted");
  });

  it("clamps the user daily pref to the plan and the engine enqueue ceiling", () => {
    expect(effectiveDailyCap("starter", 600, 60)).toBe(10);
    expect(effectiveDailyCap("autopilot", 5, 60)).toBe(5);
    expect(APPLY_ENGINE_BATCH_LIMIT).toBe(60);
  });

  it("builds a stable idempotency key per evaluation", () => {
    expect(engineIdempotencyKey("eval-1")).toBe("ae1:eval-1");
  });

  it("clamps a user daily pref to the plan bucket", () => {
    expect(clampDailyApplyCap(600, "starter")).toBe(10);
    expect(clampDailyApplyCap(3, "pro")).toBe(3);
    expect(clampDailyApplyCap(99, "free")).toBe(0);
    expect(creditPlanLabel("premium")).toBe("Autopilot");
  });

  it("parses a ledger snapshot from the RPC payload", () => {
    const snap = parseCreditSnapshot({
      plan: "starter", granted: 30, consumed: 4, refunded: 1, reserved: 2,
      remaining: 25, daily_cap: 10, daily_used: 3, daily_remaining: 7, period_start: "2026-08-01",
    });
    expect(snap).toMatchObject({ plan: "starter", remaining: 25, reserved: 2, daily_remaining: 7 });
    expect(parseCreditSnapshot(null)).toBeNull();
  });
});
