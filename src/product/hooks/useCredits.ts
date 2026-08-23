import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/components/SubscriptionGate";
import { db, tableMissing } from "@/product/lib/table";

const PLAN_GRANT: Record<string, number> = { free: 25, pro: 100, autopilot: 400 };

export function useCredits() {
  const { user } = useAuth();
  const { plan } = useSubscription();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setBalance(null);
      setLoading(false);
      return;
    }

    const { data, error } = await db().from("credit_balances").select("balance").eq("user_id", user.id).maybeSingle();
    if (!error && data && typeof (data as { balance?: number }).balance === "number") {
      setBalance((data as { balance: number }).balance);
      setLoading(false);
      return;
    }

    if (error && !tableMissing(error)) {
      setLoading(false);
      return;
    }

    const { count } = await db()
      .from("draft_applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "submitted");
    const grant = PLAN_GRANT[plan] ?? 25;
    setBalance(Math.max(0, grant - (count ?? 0)));
    setLoading(false);
  }, [user, plan]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { balance, loading, refresh };
}
