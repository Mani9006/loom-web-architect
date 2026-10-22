import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/components/SubscriptionGate";
import { BILLING_PLANS, formatPlanPrice } from "@/lib/billing-plans";
import { supabase } from "@/integrations/supabase/client";
import { MarketingLayout } from "./MarketingLayout";
import { cn } from "@/lib/utils";

const COMPARE = [
  ["Credits", "25 to start", "100 / month", "400 / month"],
  ["Fit evaluations", "10 / month", "100 / month", "100 / month"],
  ["Tailored packets", "3 / month", "30 / month", "Included in volume"],
  ["Live ATS submit", "Manual", "Guarded", "Guarded + volume"],
  ["Hands-off apply", "Off", "Off", "Explicit enable"],
  ["Submitted", "Receipt only", "Receipt only", "Receipt only"],
];

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
      <main className="mx-auto max-w-[1440px] px-5 py-10 3xl:max-w-[1520px]">
        <div className="max-w-2xl">
          <p className="rp-kicker">Billing</p>
          <h1 className="mt-2 font-display text-display-md">Plans</h1>
          <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
            One successful submit spends one credit. Stripe promo codes produce an invoice, never a fake receipt.
          </p>
        </div>
        <div className="mt-8 grid items-stretch gap-4 lg:grid-cols-3">
          {BILLING_PLANS.map((item) => (
            <article
              key={item.id}
              className={cn("flex flex-col p-6", item.popular ? "rp-raised relative z-10 lg:-translate-y-2" : "rp-panel")}
            >
              <div className="flex h-7 items-center justify-between gap-2">
                <p className="rp-kicker">{item.popular ? "Most used" : "Plan"}</p>
                {item.popular && (
                  <span className="rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-foreground">
                    Most used
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-[22px] font-semibold tracking-tight">{item.name}</h2>
              <p className="mt-2 font-display text-4xl tracking-tight">
                {formatPlanPrice(item.price)}
                <span className="ml-1 text-[13px] font-medium text-muted-foreground">{item.period === "forever" ? "" : item.period}</span>
              </p>
              <p className="mt-3 min-h-[40px] text-[13px] leading-relaxed text-muted-foreground">{item.description}</p>
              <ul className="mt-5 flex-1 space-y-2 text-[13px] leading-snug">
                {item.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={cn("mt-6 w-full", item.popular ? "rp-btn rp-btn-primary rp-btn-lg" : "rp-btn rp-btn-outline rp-btn-lg")}
                onClick={() => void checkout(item.id)}
              >
                {plan === item.id ? "Current plan" : item.cta}
              </button>
            </article>
          ))}
        </div>

        <div className="rp-panel-flush mt-8">
          <div className="border-b border-border px-4 py-3">
            <p className="rp-kicker">Compare</p>
            <h2 className="mt-1 text-[15px] font-semibold tracking-tight">Same receipt rule on every plan</h2>
          </div>
          <div className="rp-table-wrap">
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Capability</th>
                  <th>Free</th>
                  <th className="bg-primary/[0.08] text-foreground">Pro</th>
                  <th>Autopilot</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map(([label, free, pro, auto]) => (
                  <tr key={label}>
                    <td className="font-medium">{label}</td>
                    <td className="text-muted-foreground">{free}</td>
                    <td className="bg-primary/[0.08] font-medium">{pro}</td>
                    <td className="text-muted-foreground">{auto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </MarketingLayout>
  );
}
