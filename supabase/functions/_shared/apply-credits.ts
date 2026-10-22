/**
 * Credit + rate-limit rules for edge functions.
 * Keep numeric buckets in sync with src/lib/apply-credits.ts.
 */

export type CreditPlanId = "free" | "starter" | "pro" | "autopilot";

export const PLAN_CREDIT_BUCKETS: Record<CreditPlanId, { monthlyCredits: number; dailySubmitCap: number; maxInFlight: number; handsOff: boolean }> = {
  free: { monthlyCredits: 0, dailySubmitCap: 0, maxInFlight: 0, handsOff: false },
  starter: { monthlyCredits: 30, dailySubmitCap: 10, maxInFlight: 8, handsOff: false },
  pro: { monthlyCredits: 80, dailySubmitCap: 20, maxInFlight: 12, handsOff: false },
  autopilot: { monthlyCredits: 250, dailySubmitCap: 40, maxInFlight: 16, handsOff: true },
};

export const DEFAULT_ENGINE_LIMITS = {
  per_user_max_running: 12,
  global_max_running: 120,
  per_user_daily_enqueue: 60,
  per_ats_per_user_hourly: 8,
  max_batch: 60,
} as const;

export function resolveCreditPlan(raw: string | null | undefined): CreditPlanId {
  const value = String(raw || "free").trim().toLowerCase();
  if (value === "starter") return "starter";
  if (value === "autopilot" || value === "premium") return "autopilot";
  if (value === "pro") return "pro";
  return "free";
}

export function remainingCredits(granted: number, consumed: number, refunded: number, reserved: number): number {
  return Math.max(0, granted + refunded - consumed - reserved);
}

export function engineIdempotencyKey(evaluationId: string): string {
  return `ae1:${String(evaluationId || "").trim()}`;
}

export function effectiveDailyCap(plan: CreditPlanId, userPref: number, engineDailyEnqueue: number): number {
  const planCap = PLAN_CREDIT_BUCKETS[plan].dailySubmitCap;
  const pref = Number.isFinite(userPref) ? Math.max(0, userPref) : planCap;
  return Math.max(0, Math.min(planCap, pref, engineDailyEnqueue));
}

export function decideEnqueueSlot(input: {
  submittable: boolean;
  alreadySubmitted: boolean;
  alreadyQueued: boolean;
  remainingCredits: number;
  liveQueuedInBatch: number;
  dailyLiveUsed: number;
  dailyLiveCap: number;
  atsHourlyUsed: number;
  atsHourlyCap: number;
}): { ok: boolean; reason: string; occupiesCredit: boolean; detail: string } {
  if (input.alreadySubmitted) {
    return { ok: false, reason: "already_submitted", occupiesCredit: false, detail: "Already submitted with a receipt." };
  }
  if (input.alreadyQueued) {
    return { ok: false, reason: "already_queued", occupiesCredit: false, detail: "Already in the cloud queue." };
  }
  if (!input.submittable) {
    return { ok: true, reason: "ok", occupiesCredit: false, detail: "Packet will be tailored. This ATS is not live-submittable." };
  }
  if (input.remainingCredits - input.liveQueuedInBatch <= 0) {
    return { ok: false, reason: "no_credits", occupiesCredit: false, detail: "No apply credits left this month." };
  }
  if (input.dailyLiveUsed + input.liveQueuedInBatch >= input.dailyLiveCap) {
    return { ok: false, reason: "daily_cap", occupiesCredit: false, detail: `Daily live-submit cap reached (${input.dailyLiveCap}).` };
  }
  if (input.atsHourlyUsed >= input.atsHourlyCap) {
    return { ok: false, reason: "ats_rate_limit", occupiesCredit: false, detail: `Per-ATS hourly cap reached (${input.atsHourlyCap}).` };
  }
  return { ok: true, reason: "ok", occupiesCredit: true, detail: "Queued as an independent cloud job." };
}
