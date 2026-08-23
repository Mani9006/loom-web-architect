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
      toast.error("Checkout unavailable. Stripe promo codes, when present, create an invoice only.");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <MarketingLayout>
      <main className="mx-auto max-w-[1120px] px-5 py-14">
        <h1 className="text-[36px] font-semibold tracking-[-0.03em]">Plans</h1>
        <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">Credits are real: one successful submit spends one. Stripe promo codes produce an invoice, never a fake receipt.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {BILLING_PLANS.map((item) => (
            <article key={item.id} className={`rounded-2xl border bg-card p-5 ${item.popular ? "border-primary" : "border-border"}`}>
              <p className="text-[13px] font-medium">{item.name}</p>
              <p className="mt-2 text-[32px] font-semibold">{formatPlanPrice(item.price)}<span className="text-[14px] text-muted-foreground">{item.period === "forever" ? "" : item.period}</span></p>
              <p className="mt-2 text-[13px] text-muted-foreground">{item.description}</p>
              <ul className="mt-4 space-y-1.5 text-[13px]">
                {item.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <button type="button" className="mt-5 h-10 w-full rounded-md bg-primary text-[13px] font-medium text-primary-foreground" onClick={() => void checkout(item.id)}>
                {plan === item.id ? "Current plan" : item.cta}
              </button>
            </article>
          ))}
        </div>
      </main>
    </MarketingLayout>
  );
}
