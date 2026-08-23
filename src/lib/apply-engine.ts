/**
 * Pure apply-engine helpers used by the dashboard and tests.
 * Detection lives in ats-detect.ts. This module owns batch intent + row status.
 */

import { detectAtsFromUrl, type AtsDetection } from "@/lib/ats-detect";

export type ApplyIntent = "user_selected" | "hands_off";
export type HandsOffCadence = "off" | "hourly" | "daily";

export interface EngineJobInput {
  evaluation_id?: string;
  draft_id?: string;
  apply_url?: string;
}

export interface EngineJobPlan {
  evaluation_id: string | null;
  draft_id: string | null;
  apply_url: string;
  detection: AtsDetection;
  /** Cloud worker may attempt submit. Otherwise the packet stays Needs you. */
  willSubmit: boolean;
}

export function normalizeApplyIntent(value: unknown): ApplyIntent {
  return value === "hands_off" ? "hands_off" : "user_selected";
}

export function planEngineJob(input: EngineJobInput): EngineJobPlan {
  const applyUrl = String(input.apply_url || "").trim();
  const detection = detectAtsFromUrl(applyUrl);
  return {
    evaluation_id: input.evaluation_id || null,
    draft_id: input.draft_id || null,
    apply_url: applyUrl,
    detection,
    willSubmit: detection.submittable,
  };
}

export function normalizeHandsOffCadence(value: unknown): HandsOffCadence {
  return value === "off" || value === "daily" ? value : "hourly";
}

/** Scheduler may enqueue only when the kill switch is on and cadence allows it. */
export function shouldSchedulerEnqueue(input: {
  cadence: HandsOffCadence;
  autoApplyEnabled: boolean;
  agentEnabled: boolean;
  handsOffQueuedToday: number;
}): boolean {
  if (!input.autoApplyEnabled || !input.agentEnabled) return false;
  if (input.cadence === "off") return false;
  if (input.cadence === "daily" && input.handsOffQueuedToday > 0) return false;
  return true;
}

export function uniqueEvaluationIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of values) {
    const id = typeof value === "string" ? value.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids.slice(0, 50);
}
