/**
 * Apply-engine money + scale rules.
 *
 * One successful portal submit = 1 credit. System-side failures do not
 * consume credit. Stripe promotion codes discount the invoice, not the bucket.
 * These numbers are the product contract — not 500–600 applies/day on $19.
 */

export type CreditPlanId = "free" | "starter" | "pro" | "autopilot";

export interface PlanCreditBucket {
  plan: CreditPlanId;
  monthlyCredits: number;
  dailySubmitCap: number;
  maxInFlight: number;
  handsOff: boolean;
  listPriceUsd: number;
}

/** Honest monthly buckets. Browser workers + tailoring are not free. */
export const PLAN_CREDIT_BUCKETS: Record<CreditPlanId, PlanCreditBucket> = {
  free: { plan: "free", monthlyCredits: 0, dailySubmitCap: 0, maxInFlight: 0, handsOff: false, listPriceUsd: 0 },
  starter: { plan: "starter", monthlyCredits: 30, dailySubmitCap: 10, maxInFlight: 8, handsOff: false, listPriceUsd: 19 },
  pro: { plan: "pro", monthlyCredits: 80, dailySubmitCap: 20, maxInFlight: 12, handsOff: false, listPriceUsd: 39 },
  autopilot: { plan: "autopilot", monthlyCredits: 250, dailySubmitCap: 40, maxInFlight: 16, handsOff: true, listPriceUsd: 99 },
};

/** Worker / queue ceilings. Operators can override via apply_engine_limits. */
export const DEFAULT_ENGINE_LIMITS = {
  per_user_max_running: 12,
  global_max_running: 120,
  per_user_daily_enqueue: 60,
  per_ats_per_user_hourly: 8,
  max_batch: 60,
} as const;

export const APPLY_ENGINE_BATCH_LIMIT = DEFAULT_ENGINE_LIMITS.max_batch;

export function resolveCreditPlan(raw: string | null | undefined): CreditPlanId {
  const value = String(raw || "free").trim().toLowerCase();
  if (value === "starter") return "starter";
  if (value === "autopilot" || value === "premium") return "autopilot";
  if (value === "pro") return "pro";
  return "free";
}

export function utcMonthStart(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function remainingCredits(input: {
  granted: number;
  consumed: number;
  refunded: number;
  reserved: number;
}): number {
  return Math.max(0, input.granted + input.refunded - input.consumed - input.reserved);
}

export type EnqueueBlockReason =
  | "ok"
  | "no_credits"
  | "daily_cap"
  | "ats_rate_limit"
  | "already_submitted"
  | "already_queued";

export interface EnqueueSlotDecision {
  ok: boolean;
  reason: EnqueueBlockReason;
  /** Live adapters occupy a credit slot until they terminate without a receipt. */
  occupiesCredit: boolean;
  detail: string;
}

/**
 * Decide whether one independent cloud job may enter the queue.
 * Unsupported ATS still enqueue (Needs you) and never occupy a credit.
 */
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
}): EnqueueSlotDecision {
  if (input.alreadySubmitted) {
    return { ok: false, reason: "already_submitted", occupiesCredit: false, detail: "Already submitted with a receipt. Retries will not double-submit." };
  }
  if (input.alreadyQueued) {
    return { ok: false, reason: "already_queued", occupiesCredit: false, detail: "Already in the cloud queue." };
  }
  if (!input.submittable) {
    return { ok: true, reason: "ok", occupiesCredit: false, detail: "Packet will be tailored. This ATS is not live-submittable." };
  }
  if (input.remainingCredits - input.liveQueuedInBatch <= 0) {
    return { ok: false, reason: "no_credits", occupiesCredit: false, detail: "No apply credits left this month. Failed system-side submits do not consume credits." };
  }
  if (input.dailyLiveUsed + input.liveQueuedInBatch >= input.dailyLiveCap) {
    return { ok: false, reason: "daily_cap", occupiesCredit: false, detail: `Daily live-submit cap reached (${input.dailyLiveCap}).` };
  }
  if (input.atsHourlyUsed >= input.atsHourlyCap) {
    return { ok: false, reason: "ats_rate_limit", occupiesCredit: false, detail: `Per-ATS hourly cap reached (${input.atsHourlyCap}) to protect workers and employer IPs.` };
  }
  return { ok: true, reason: "ok", occupiesCredit: true, detail: "Queued as an independent cloud job." };
}

export function effectiveDailyCap(plan: CreditPlanId, userPref: number, engineDailyEnqueue: number): number {
  const planCap = PLAN_CREDIT_BUCKETS[plan].dailySubmitCap;
  const pref = Number.isFinite(userPref) ? Math.max(0, userPref) : planCap;
  return Math.max(0, Math.min(planCap, pref, engineDailyEnqueue));
}

export function engineIdempotencyKey(evaluationId: string): string {
  return `ae1:${String(evaluationId || "").trim()}`;
}

export function creditPlanLabel(plan: string | null | undefined): string {
  switch (resolveCreditPlan(plan)) {
    case "starter":
      return "Starter";
    case "pro":
      return "Pro";
    case "autopilot":
      return "Autopilot";
    default:
      return "Free";
  }
}

export function clampDailyApplyCap(value: number, plan: CreditPlanId): number {
  const max = PLAN_CREDIT_BUCKETS[plan].dailySubmitCap;
  if (max <= 0) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return max;
  return Math.min(max, Math.max(1, Math.round(n)));
}

export interface ApplyCreditSnapshot {
  plan: CreditPlanId;
  period_start: string;
  granted: number;
  consumed: number;
  refunded: number;
  reserved: number;
  remaining: number;
  daily_cap: number;
  daily_used: number;
  daily_remaining: number;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function parseCreditSnapshot(raw: unknown): ApplyCreditSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const granted = asNumber(row.granted);
  const consumed = asNumber(row.consumed);
  const refunded = asNumber(row.refunded);
  const reserved = asNumber(row.reserved);
  return {
    plan: resolveCreditPlan(typeof row.plan === "string" ? row.plan : "free"),
    period_start: String(row.period_start || ""),
    granted,
    consumed,
    refunded,
    reserved,
    remaining: asNumber(row.remaining, remainingCredits({ granted, consumed, refunded, reserved })),
    daily_cap: asNumber(row.daily_cap),
    daily_used: asNumber(row.daily_used),
    daily_remaining: asNumber(row.daily_remaining),
  };
}
