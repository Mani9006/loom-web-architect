import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/components/SubscriptionGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Check, Sparkles, Zap, Crown, Loader2, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BILLING_PLANS, formatPlanPrice, type BillingPlanId } from "@/lib/billing-plans";
import { captureIncident } from "@/lib/incidents";
import { toUserFacingError, withSupportReference } from "@/lib/user-facing-error";

export default function PricingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { plan: currentPlan, refresh } = useSubscription();
  const [loadingPlan, setLoadingPlan] = useState<BillingPlanId | null>(null);

  const handleUpgrade = async (planType: BillingPlanId) => {
    if (planType === "free") return;
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to upgrade." });
      return;
    }

    setLoadingPlan(planType);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "";

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || anonKey}`,
          },
          body: JSON.stringify({ planType }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          await refresh();
          toast({ title: "Subscription activated", description: `Welcome to ResumePreps ${planType === "pro" ? "Pro" : "Autopilot"}.` });
        }
      } else {
        const detail = await response.text();
        throw new Error(`Checkout request failed (${response.status}): ${detail.slice(0, 300)}`);
      }
    } catch (error) {
      void captureIncident(error, { source: "manual", operation: "checkout_start" });
      const safeError = toUserFacingError(error, {
        operation: "checkout_start",
        defaultMessage: "Checkout is temporarily unavailable. Your current plan is unchanged; try again later.",
      });
      toast({
        title: safeError.title,
        description: withSupportReference(safeError),
        variant: "destructive",
      });
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="bg-muted/30 min-h-full">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Choose Your Plan</h1>
          <p className="text-muted-foreground">Choose how much of your job search you want ResumePreps to handle.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {BILLING_PLANS.map((plan) => (
            <Card
              key={plan.name}
              className={cn(
                "relative overflow-hidden transition-all hover:shadow-lg",
                plan.popular && "ring-2 ring-primary shadow-lg"
              )}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-lg">
                  MOST POPULAR
                </div>
              )}
              <CardHeader>
                <div className="flex items-center gap-2">
                  {plan.id === "autopilot" ? <Crown className="w-5 h-5 text-primary" /> : plan.id === "pro" ? <Sparkles className="w-5 h-5 text-primary" /> : <Zap className="w-5 h-5 text-muted-foreground" />}
                  <CardTitle>{plan.name}</CardTitle>
                </div>
                <div className="mt-2">
                  <span className="text-4xl font-bold">{formatPlanPrice(plan.price)}</span>
                  <span className="text-muted-foreground ml-1">{plan.period}</span>
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full gap-2"
                  variant={plan.popular ? "default" : "outline"}
                  disabled={loadingPlan !== null || currentPlan === plan.id || plan.id === "free"}
                  onClick={() => handleUpgrade(plan.id)}
                >
                  {loadingPlan === plan.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  {currentPlan === plan.id ? "Current Plan" : plan.id === "free" ? "Included" : plan.cta}
                  {plan.popular && currentPlan !== plan.id && <ArrowRight className="w-4 h-4" />}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center text-sm text-muted-foreground">
          <p>Clear monthly limits protect application quality and prevent surprise usage charges.</p>
          <p className="mt-1">Cancel anytime. No long-term commitment required.</p>
          <p className="mt-1">Need help? Contact us at support@resumepreps.com</p>
        </div>
      </div>
    </div>
  );
}
