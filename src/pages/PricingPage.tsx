import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Check, Sparkles, Zap, Crown, Loader2, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Everything you need to start applying.",
    features: [
      "3 AI résumés",
      "ATS score checking",
      "Basic job search",
      "5 cover letters / month",
      "Job pipeline tracker",
    ],
    cta: "Current Plan",
    popular: false,
    planType: "free",
  },
  {
    name: "Pro",
    price: "$12",
    period: "/month",
    description: "For serious candidates running a real search.",
    features: [
      "Unlimited résumés",
      "Matches + evaluations",
      "Unlimited cover letters",
      "Voice interview prep",
      "Real-time job matching",
      "My Collection sessions",
      "Priority support",
    ],
    cta: "Start free trial",
    popular: true,
    planType: "pro",
  },
  {
    name: "Enterprise",
    price: "$29",
    period: "/month",
    description: "The whole studio, with auto-apply + coach.",
    features: [
      "Everything in Pro",
      "Greenhouse auto-apply",
      "LinkedIn optimizer",
      "Skill gap analyzer",
      "Career coach AI",
      "API access",
    ],
    cta: "Contact sales",
    popular: false,
    planType: "enterprise",
  },
];

export default function PricingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<string>("free");

  const handleUpgrade = async (planType: string) => {
    if (planType === "free") return;
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to upgrade." });
      return;
    }

    setLoading(true);
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
          toast({ title: "Subscription activated!", description: "Welcome to Premium!" });
          setCurrentPlan("premium");
        }
      } else {
        const err = await response.json();
        toast({
          title: "Upgrade unavailable",
          description: err.message || "Stripe integration coming soon. Contact support for early access.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Coming Soon",
        description: "Payment integration is being set up. Contact support for early access to Premium.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-muted/30 min-h-full">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Choose Your Plan</h1>
          <p className="text-muted-foreground">Supercharge your job search with AI-powered automation</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
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
                  {plan.popular ? <Crown className="w-5 h-5 text-primary" /> : <Zap className="w-5 h-5 text-muted-foreground" />}
                  <CardTitle>{plan.name}</CardTitle>
                </div>
                <div className="mt-2">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
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
                  disabled={loading || currentPlan === plan.planType}
                  onClick={() => handleUpgrade(plan.planType)}
                >
                  {loading && plan.popular ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  {currentPlan === plan.planType ? "Current Plan" : plan.cta}
                  {plan.popular && currentPlan !== plan.planType && <ArrowRight className="w-4 h-4" />}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center text-sm text-muted-foreground">
          <p>Cancel anytime. No long-term commitment required.</p>
          <p className="mt-1">Need help? Contact us at support@resumepreps.com</p>
        </div>
      </div>
    </div>
  );
}
