import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { PublicFrame } from "@/components/brand/PublicFrame";
import { BILLING_PLANS, formatPlanPrice } from "@/lib/billing-plans";
import { PLAN_CREDIT_BUCKETS } from "@/lib/apply-credits";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const rows = [
  { label: "Monthly credits", values: ["0", "30", "80", "250"] },
  { label: "Live submits / day", values: ["0", "10", "20", "40"] },
  { label: "In-flight live jobs", values: ["0", "8", "12", "16"] },
  { label: "Apply selected (batch 60)", values: ["Needs you only", "Yes", "Yes", "Yes"] },
  { label: "Hands-off scheduler", values: ["—", "—", "—", "Hourly or daily"] },
  { label: "Kill switch", values: ["—", "—", "—", "Yes"] },
  { label: "Live adapters", values: ["Detect only", "5 adapters", "5 adapters", "5 adapters"] },
];

const faqs = [
  { q: "What is a credit?", a: "One successful portal submit. If the worker fails for a system reason, the credit is not consumed." },
  { q: "Do promo codes add credits?", a: "No. Influencer and Stripe codes discount the invoice. The monthly bucket is unchanged." },
  { q: "Why not hundreds of applies a day?", a: "Tailoring, form fill, and honest receipts cost real worker time. Caps keep the ledger honest." },
  { q: "Can I apply without Autopilot?", a: "Yes. Starter and Pro apply the jobs you select. Autopilot adds the scheduler and kill switch." },
];

export default function PlansPage() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    document.title = "Plans — ResumePreps";
    supabase.auth.getSession().then(({ data: { session } }) => setSignedIn(Boolean(session?.user)));
  }, []);

  return (
    <PublicFrame signedIn={signedIn}>
      <main>
        <section className="mx-auto max-w-[1180px] px-6 py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-accent-2">Credits</p>
          <h1 className="mt-3 max-w-[16ch] font-display text-[52px] italic leading-[0.94] sm:text-[64px]">Plans that match the ledger.</h1>
          <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-rp-ink-2">
            One successful portal submit costs one credit. System-side failures do not. Stripe influencer codes discount the invoice, never the monthly bucket. These are not hundreds of applies per day.
          </p>
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {BILLING_PLANS.map((plan) => {
              const bucket = PLAN_CREDIT_BUCKETS[plan.id];
              return (
                <article key={plan.id} className={cn("flex flex-col rounded-lg border bg-rp-paper p-6", plan.popular ? "border-rp-accent" : "border-rp-ink/10")}>
                  {plan.popular && <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-rp-accent">Most used</p>}
                  <p className="text-[12px] uppercase tracking-[0.12em] text-rp-ink-3">{plan.name}</p>
                  <p className="mt-3 font-display text-[44px] italic">{formatPlanPrice(plan.price)}</p>
                  <p className="text-[13px] text-rp-ink-3">{plan.period}</p>
                  <p className="mt-3 text-[14px] text-rp-ink-2">{plan.description}</p>
                  <ul className="mt-5 flex-1 space-y-2 text-[13px] text-rp-ink-2">
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-rp-accent-2" />{bucket.monthlyCredits} credits / month</li>
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-rp-accent-2" />{bucket.dailySubmitCap} live submits / day</li>
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-rp-accent-2" />{bucket.maxInFlight} in flight</li>
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-rp-accent-2" />{bucket.handsOff ? "Hands-off scheduler" : "Apply selected only"}</li>
                  </ul>
                  <Link
                    to={signedIn ? "/pricing" : "/auth?mode=signup"}
                    className="mt-6 rounded-md bg-primary px-4 py-2.5 text-center text-[13px] font-medium text-primary-foreground no-underline"
                  >
                    {signedIn ? "Manage billing" : plan.cta}
                  </Link>
                </article>
              );
            })}
          </div>
        </section>

        <section className="border-y border-rp-ink/10 bg-rp-paper py-16">
          <div className="mx-auto max-w-[1180px] px-6">
            <h2 className="font-display text-[36px] italic">Side by side</h2>
            <div className="mt-8 overflow-x-auto rounded-lg border border-rp-ink/10 bg-rp-canvas">
              <table className="w-full min-w-[720px] text-left text-[14px]">
                <thead className="border-b border-rp-ink/10 font-mono text-[11px] uppercase tracking-[0.12em] text-rp-ink-3">
                  <tr>
                    <th className="px-5 py-3"> </th>
                    {BILLING_PLANS.map((plan) => <th key={plan.id} className="px-5 py-3">{plan.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label} className="border-b border-rp-ink/10 last:border-0">
                      <td className="px-5 py-3.5 font-medium">{row.label}</td>
                      {row.values.map((value, index) => (
                        <td key={`${row.label}-${index}`} className="px-5 py-3.5 text-rp-ink-2">{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1180px] px-6 py-16">
          <h2 className="font-display text-[36px] italic">Promo codes</h2>
          <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-rp-ink-2">
            Influencer codes are Stripe promotion codes. They reduce what you pay on the invoice. They do not mint extra credits and they do not mark a job submitted.
          </p>
          <dl className="mt-10 grid gap-4 md:grid-cols-2">
            {faqs.map((item) => (
              <div key={item.q} className="rounded-lg border border-rp-ink/10 bg-rp-paper p-5">
                <dt className="font-medium">{item.q}</dt>
                <dd className="mt-2 text-[14px] leading-relaxed text-rp-ink-2">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </PublicFrame>
  );
}
