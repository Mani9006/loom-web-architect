/* eslint-disable @typescript-eslint/no-explicit-any -- user_access_controls is not yet in the generated client types */
import { useState, useEffect, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  resolveSubscription,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "@/lib/subscription";

interface SubscriptionState {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  isPremium: boolean;
  hasAutoApply: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionState>({
  plan: "free",
  status: "active",
  isPremium: false,
  hasAutoApply: false,
  loading: true,
  refresh: async () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<Omit<SubscriptionState, "refresh">>({
    plan: "free",
    status: "active",
    isPremium: false,
    hasAutoApply: false,
    loading: true,
  });

  const refresh = async () => {
    if (!user) {
      setState({ plan: "free", status: "active", isPremium: false, hasAutoApply: false, loading: false });
      return;
    }

    try {
      const { data, error } = await (supabase as any)
        .from("user_access_controls")
        .select("account_status, purchase_state, subscription_plan")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      setState({ ...resolveSubscription(data), loading: false });
    } catch {
      setState({ plan: "free", status: "active", isPremium: false, hasAutoApply: false, loading: false });
    }
  };

  useEffect(() => {
    refresh();
  }, [user]);

  return (
    <SubscriptionContext.Provider value={{ ...state, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  );
}
