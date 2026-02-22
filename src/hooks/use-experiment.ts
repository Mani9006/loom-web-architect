/**
 * use-experiment.ts
 * React hook for the Growth Experiment Fabric.
 *
 * Usage:
 *   const { variant, track } = useExperiment("landing-cta-v1");
 *
 *   // Render the right branch:
 *   {variant === "treatment" ? <NewCTA /> : <OriginalCTA />}
 *
 *   // Track a conversion:
 *   track("signup");
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  assignVariant,
  fetchRunningExperiments,
  persistAssignment,
  trackExperimentEvent,
  type Experiment,
} from "@/lib/experiment-tracker";

interface UseExperimentResult {
  /** The variant assigned to the current user ('control' when loading or not enrolled). */
  variant: string;
  /** Whether the assignment is still being determined. */
  loading: boolean;
  /** Fire a named funnel event for this experiment. */
  track: (eventName: string, properties?: Record<string, unknown>) => void;
}

// Module-level cache so we don't re-fetch experiments on every hook mount.
let experimentsCache: Experiment[] | null = null;
let experimentsCachePromise: Promise<Experiment[]> | null = null;

async function getExperiments(): Promise<Experiment[]> {
  if (experimentsCache) return experimentsCache;
  if (!experimentsCachePromise) {
    experimentsCachePromise = fetchRunningExperiments().then((data) => {
      experimentsCache = data;
      return data;
    });
  }
  return experimentsCachePromise;
}

export function useExperiment(experimentId: string): UseExperimentResult {
  const [variant, setVariant] = useState("control");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id;

      const experiments = await getExperiments();
      const experiment = experiments.find((e) => e.id === experimentId);

      if (!experiment || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }

      // Use userId for enrolled users; anonymous users always get control.
      if (!uid) {
        if (!cancelled) setLoading(false);
        return;
      }

      const assigned = assignVariant(uid, experiment);
      if (!cancelled) {
        setUserId(uid);
        setVariant(assigned);
        setLoading(false);
      }

      // Persist in background – fire-and-forget, don't block rendering.
      persistAssignment(uid, experimentId, assigned).catch(() => {});
    }

    resolve();
    return () => { cancelled = true; };
  }, [experimentId]);

  const track = useCallback(
    (eventName: string, properties?: Record<string, unknown>) => {
      trackExperimentEvent({
        userId,
        experimentId,
        variant,
        eventName,
        properties,
      }).catch(() => {});
    },
    [userId, experimentId, variant]
  );

  return { variant, loading, track };
}
