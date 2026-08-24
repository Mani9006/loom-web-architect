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
    window.location.assign(data.url);
  }

  return (
    <MarketingLayout>
      <main className="mx-auto max-w-[1440px] px-5 py-16 3xl:max-w-[1520px] 3xl:py-20">
        <div className="max-w-2xl">
          <p className="rp-kicker">Billing</p>
          <h1 className="mt-3 font-display text-display-md">Plans</h1>
          <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
            One successful submit spends one credit. Stripe promo codes produce an invoice, never a fake receipt.
          </p>
        </div>
        <div className="mt-12 overflow-hidden rounded-lg border border-border">
          <div className="grid lg:grid-cols-3">
            {BILLING_PLANS.map((item, index) => (
              <article
                key={item.id}
                className={`flex flex-col bg-card p-7 ${index > 0 ? "border-t border-border lg:border-l lg:border-t-0" : ""} ${item.popular ? "bg-muted/30" : ""}`}
              >
                <p className="rp-kicker">{item.popular ? "Most used" : "Plan"}</p>
                <h2 className="mt-3 text-[22px] font-semibold tracking-tight">{item.name}</h2>
                <p className="mt-3 font-display text-4xl tracking-tight">
                  {formatPlanPrice(item.price)}
                  <span className="ml-1 text-[13px] font-medium text-muted-foreground">{item.period === "forever" ? "" : item.period}</span>
                </p>
                <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{item.description}</p>
                <ul className="mt-6 flex-1 space-y-2.5 text-[13px] leading-snug">
                  {item.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`mt-8 w-full ${item.popular ? "rp-btn rp-btn-primary rp-btn-lg" : "rp-btn rp-btn-outline rp-btn-lg"}`}
                  onClick={() => void checkout(item.id)}
                >
                  {plan === item.id ? "Current plan" : item.cta}
                </button>
              </article>
            ))}
          </div>
        </div>
      </main>
    </MarketingLayout>
  );
}
