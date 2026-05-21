/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface SubscriptionState {
  plan: "free" | "premium";
  status: "active" | "canceled" | "past_due" | "trialing";
  isPremium: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionState>({
  plan: "free",
  status: "active",
  isPremium: false,
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
    loading: true,
  });

  const refresh = async () => {
    if (!user) {
      setState({ plan: "free", status: "active", isPremium: false, loading: false });
      return;
    }

    try {
      const { data } = await supabase
        .from("subscription_plans")
        .select("plan_type, status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        const plan = (data.plan_type as "free" | "premium") || "free";
        const status = (data.status as SubscriptionState["status"]) || "active";
        setState({
          plan,
          status,
          isPremium: plan === "premium" && status === "active",
          loading: false,
        });
      } else {
        setState({ plan: "free", status: "active", isPremium: false, loading: false });
      }
    } catch {
      setState({ plan: "free", status: "active", isPremium: false, loading: false });
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
