/**
 * experiment-tracker.ts
 * Client-side utility for the Growth Experiment Fabric.
 *
 * Responsibilities:
 *  1. Deterministic variant assignment – a stable hash of (userId + experimentId)
 *     maps each user to a variant without a round-trip.
 *  2. Persist assignment in Supabase so it survives page reloads.
 *  3. Fire experiment events to both Supabase (for analysis) and
 *     Vercel Analytics (for dashboards) via `window.va`.
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Experiment {
  id: string;
  variants: string[];
  /** Traffic percentage 1-100; users outside the bucket get "control". */
  traffic_pct: number;
  status: "draft" | "running" | "paused" | "concluded";
}

export interface ExperimentAssignment {
  experimentId: string;
  variant: string;
}

// ─── Deterministic hash ───────────────────────────────────────────────────────

/**
 * Fast, dependency-free 32-bit hash (djb2 variant).
 * Returns a float in [0, 1).
 */
function stableHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash / 0x100000000;
}

/**
 * Assign a user to a variant for the given experiment.
 * Deterministic: same userId + experimentId always yields the same variant.
 * Users outside the traffic_pct bucket always get "control".
 */
export function assignVariant(
  userId: string,
  experiment: Pick<Experiment, "id" | "variants" | "traffic_pct">
): string {
  const bucket = stableHash(`${userId}:${experiment.id}`);
  if (bucket * 100 >= experiment.traffic_pct) return "control";
  // Normalise bucket into [0, 1) within the enrolled population so that
  // variant assignment is uniformly distributed among enrolled users.
  const enrolled = (bucket * 100) / experiment.traffic_pct;
  const variantIdx = Math.floor(enrolled * experiment.variants.length);
  return experiment.variants[variantIdx] ?? "control";
}

// ─── Supabase persistence ─────────────────────────────────────────────────────

/** Upsert assignment into Supabase so we have a server-side record. */
export async function persistAssignment(
  userId: string,
  experimentId: string,
  variant: string
): Promise<void> {
  await supabase.from("experiment_assignments").upsert(
    { experiment_id: experimentId, user_id: userId, variant },
    { onConflict: "experiment_id,user_id", ignoreDuplicates: true }
  );
}

// ─── Vercel Analytics shim ────────────────────────────────────────────────────

/** Call Vercel's `va('event', …)` if the script is loaded. */
function vercelTrack(eventName: string, props: Record<string, unknown>): void {
  try {
    // @vercel/analytics injects window.va in production
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const va = (window as any).va;
    if (typeof va === "function") {
      va("event", { name: eventName, ...props });
    }
  } catch {
    // never throw from analytics
  }
}

// ─── Event tracking ───────────────────────────────────────────────────────────

export interface TrackEventOptions {
  userId?: string;
  experimentId: string;
  variant: string;
  eventName: string;
  properties?: Record<string, unknown>;
}

/**
 * Track a funnel event for an experiment.
 * - Writes to `experiment_events` in Supabase.
 * - Mirrors to Vercel Analytics as `exp:{experimentId}:{eventName}`.
 */
export async function trackExperimentEvent(
  options: TrackEventOptions
): Promise<void> {
  const { userId, experimentId, variant, eventName, properties = {} } = options;

  const vercelEventName = `exp:${experimentId}:${eventName}`;
  vercelTrack(vercelEventName, { variant, ...properties });

  await supabase.from("experiment_events").insert({
    experiment_id: experimentId,
    user_id: userId ?? null,
    variant,
    event_name: eventName,
    properties,
  });
}

// ─── Bulk experiment loader ───────────────────────────────────────────────────

/** Fetch all running experiments from Supabase. */
export async function fetchRunningExperiments(): Promise<Experiment[]> {
  const { data } = await supabase
    .from("experiments")
    .select("id, variants, traffic_pct, status")
    .eq("status", "running");
  return (data ?? []) as Experiment[];
}
