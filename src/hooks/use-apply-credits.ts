import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { captureIncident } from "@/lib/incidents";
import {
  parseCreditSnapshot,
  type ApplyCreditSnapshot,
} from "@/lib/apply-credits";

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

export function useApplyCredits(pollMs = 30_000) {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<ApplyCreditSnapshot | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setSnapshot(null);
      return;
    }
    const { data, error } = await (supabase as unknown as RpcClient).rpc(
      "get_apply_credit_snapshot",
      { p_user_id: user.id },
    );
    if (error) {
      void captureIncident(new Error(error.message), {
        source: "manual",
        operation: "apply_credit_snapshot",
      }, "warning");
      return;
    }
    setSnapshot(parseCreditSnapshot(data));
  }, [user]);

  useEffect(() => {
    void refresh();
    if (!user || pollMs <= 0) return;
    const timer = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(timer);
  }, [pollMs, refresh, user]);

  return { snapshot, refresh };
}
