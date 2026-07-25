/**
 * Pricing — Editorial Prestige.
 *
 * Three plans presented as three columns of a magazine ledger, separated by
 * hairline rules. No cards, no shadow, no rounded borders. Middle column is
 * marked as the featured plan with a gold ember glow and an inline chapeau.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/components/SubscriptionGate";
import { Check, ArrowUpRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BILLING_PLANS, formatPlanPrice, type BillingPlanId } from "@/lib/billing-plans";
import { captureIncident } from "@/lib/incidents";
import { toUserFacingError, withSupportReference } from "@/lib/user-facing-error";
import { PageHeader } from "@/components/PageHeader";

const URBAN = { fontFamily: '"Urbanist", "Manrope", system-ui, sans-serif' } as const;
const EPI = { fontFamily: '"Epilogue", "Inter", system-ui, sans-serif' } as const;
const MONO = { fontFamily: '"JetBrains Mono", ui-monospace, monospace' } as const;

export default function PricingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { plan: currentPlan } = useSubscription();
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
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || anonKey}` },
          body: JSON.stringify({ planType }),
        },
      );
      if (response.ok) {
        const data = await response.json();
        if (data.url) window.location.href = data.url;
        else throw new Error("Checkout session was not created (no redirect URL returned).");
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
      toast({ title: safeError.title, description: withSupportReference(safeError), variant: "destructive" });
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-full bg-rp-canvas text-rp-ink">
      <div className="max-w-[1280px] mx-auto px-8 lg:px-12 pt-12 pb-24">
        <PageHeader
          title="Choose your edition."
          status="pricing · three tiers"
          description="Choose how much of the job search you want ResumePreps to run for you. Cancel any time."
        />

        {/* Three-column ledger, separated by hairline rules */}
        <section className="mt-4 border-y border-rp-rule">
          <div className="grid grid-cols-1 lg:grid-cols-3 lg:divide-x lg:divide-rp-rule">
            {BILLING_PLANS.map((plan, i) => {
              const isFeatured = plan.popular;
              const isCurrent = currentPlan === plan.id;
              return (
                <article
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col p-8 lg:p-10 min-h-[640px]",
                    isFeatured && "bg-rp-paper/40",
                  )}
                >
                  {isFeatured && (
                    <div
                      aria-hidden
                      className="absolute -top-12 -right-6 w-64 h-64 rounded-full blur-3xl pointer-events-none"
                      style={{ background: "hsl(var(--rp-accent) / 0.10)" }}
                    />
                  )}

                  <header className="relative">
                    <div className="flex items-baseline gap-3 mb-2">
                      <span
                        className="text-rp-ink-3 tabular-nums"
                        style={{ ...MONO, fontSize: "11px", letterSpacing: "0.14em" }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={cn(
                          isFeatured ? "text-rp-accent" : "text-rp-ink-3",
                        )}
                        style={{ ...URBAN, fontSize: "10.5px", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}
                      >
                        {isFeatured ? "Featured tier" : plan.id === "free" ? "Get started" : "Full autonomy"}
                      </span>
                    </div>
                    <h2
                      className="text-rp-ink"
                      style={{ ...URBAN, fontSize: "38px", lineHeight: 1.05, letterSpacing: "-0.02em", fontWeight: 400 }}
                    >
                      {plan.name}
                    </h2>

                    <div className="mt-6 flex items-baseline gap-2">
                      <span
                        className={cn("tabular-nums", isFeatured ? "text-rp-accent-2" : "text-rp-ink")}
                        style={{ ...URBAN, fontSize: "56px", lineHeight: 1, letterSpacing: "-0.03em", fontWeight: 200 }}
                      >
                        {formatPlanPrice(plan.price)}
                      </span>
                      <span
                        className="text-rp-ink-3"
                        style={{ ...EPI, fontSize: "13px", fontWeight: 300 }}
                      >
                        {plan.period}
                      </span>
                    </div>

                    <p
                      className="text-rp-ink-2 mt-4 max-w-sm leading-relaxed"
                      style={{ ...EPI, fontSize: "14px", fontWeight: 300 }}
                    >
                      {plan.description}
                    </p>
                  </header>

                  <div className="my-8 h-px bg-rp-rule" />

                  <ul className="space-y-3.5 flex-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3">
                        <Check
                          className={cn("w-4 h-4 mt-0.5 shrink-0", isFeatured ? "text-rp-accent" : "text-rp-ink-3")}
                          strokeWidth={1.75}
                        />
                        <span
                          className="text-rp-ink-2"
                          style={{ ...EPI, fontSize: "13.5px", lineHeight: 1.55, fontWeight: 300 }}
                        >
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <button
                    disabled={loadingPlan !== null || isCurrent || plan.id === "free"}
                    onClick={() => handleUpgrade(plan.id)}
                    className={cn(
                      "mt-10 group inline-flex items-center justify-between gap-3 border-b pb-2 transition-colors",
                      isFeatured
                        ? "border-rp-accent text-rp-accent hover:text-rp-accent-2 hover:border-rp-accent-2"
                        : "border-rp-rule-2 text-rp-ink hover:border-rp-accent hover:text-rp-accent",
                      (isCurrent || plan.id === "free") && "opacity-60 cursor-not-allowed",
                    )}
                    style={{ ...URBAN, fontSize: "11.5px", fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase" }}
                  >
                    <span className="inline-flex items-center gap-2">
                      {loadingPlan === plan.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {isCurrent ? "Current plan" : plan.id === "free" ? "Included on sign-up" : plan.cta}
                    </span>
                    {!isCurrent && plan.id !== "free" && (
                      <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" strokeWidth={1.75} />
                    )}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <footer className="mt-12 flex flex-wrap items-baseline justify-between gap-6 border-t border-rp-rule pt-6">
          <p className="text-rp-ink-3 max-w-2xl leading-relaxed" style={{ ...EPI, fontSize: "13px", fontWeight: 300 }}>
            Monthly limits are deliberate. They exist so every application stays worth reading, and so you never see a
            surprise usage charge at the end of the month.
          </p>
          <a
            href="mailto:support@resumepreps.com"
            className="text-rp-ink-2 hover:text-rp-accent transition-colors inline-flex items-center gap-2"
            style={{ ...URBAN, fontSize: "11px", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}
          >
            Talk to us
            <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
          </a>
        </footer>
      </div>
    </div>
  );
}
