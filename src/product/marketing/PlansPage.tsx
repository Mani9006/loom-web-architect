import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/components/SubscriptionGate";
import { BILLING_PLANS, formatPlanPrice } from "@/lib/billing-plans";
import { supabase } from "@/integrations/supabase/client";
import { MarketingLayout } from "./MarketingLayout";

export default function PlansPage() {
  const { user } = useAuth();
  const { plan } = useSubscription();
  const navigate = useNavigate();

  async function checkout(planId: string) {
    if (!user) {
      navigate("/auth?mode=signup");
      return;
    }
    if (planId === "free") {
      navigate("/home");
      return;
    }
    const { data, error } = await supabase.functions.invoke("create-checkout", { body: { plan: planId } });
    if (error || !data?.url) {
      toast.error("Checkout unavailable. Promo codes, when present, create an invoice only.");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <MarketingLayout>
      <main className="mx-auto max-w-6xl px-5 py-20">
        <p className="text-caption text-primary">Billing</p>
        <h1 className="mt-4 font-display text-5xl">Plans</h1>
        <p className="mt-5 max-w-xl text-body text-muted-foreground">
          One successful submit spends one credit. Stripe promo codes produce an invoice, never a fake receipt.
        </p>
        <div className="mt-16 grid gap-px bg-border md:grid-cols-3">
          {BILLING_PLANS.map((item) => (
            <article key={item.id} className="bg-background p-8">
              <p className="text-caption text-muted-foreground">{item.popular ? "Most used" : "Plan"}</p>
              <h2 className="mt-4 font-display text-3xl">{item.name}</h2>
              <p className="mt-3 font-display text-4xl">
                {formatPlanPrice(item.price)}
                <span className="ml-1 text-base text-muted-foreground">{item.period === "forever" ? "" : item.period}</span>
              </p>
              <p className="mt-4 text-body text-muted-foreground">{item.description}</p>
              <ul className="mt-6 space-y-2 text-body">
                {item.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-8 w-full bg-primary py-3 text-caption text-primary-foreground"
                onClick={() => void checkout(item.id)}
              >
                {plan === item.id ? "Current plan" : item.cta}
              </button>
            </article>
          ))}
        </div>
      </main>
    </MarketingLayout>
  );
}
