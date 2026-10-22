import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Ban,
  Cloud,
  FileText,
  Inbox,
  Radar,
  Receipt,
  ShieldCheck,
  Scale,
  Lock,
  CircleSlash,
} from "lucide-react";
import { PublicFrame } from "@/components/brand/PublicFrame";
import { ProductTheater } from "@/components/brand/ProductTheater";
import { BILLING_PLANS, formatPlanPrice } from "@/lib/billing-plans";
import { PLAN_CREDIT_BUCKETS } from "@/lib/apply-credits";
import { supabase } from "@/integrations/supabase/client";

const loop = [
  { icon: Radar, title: "Matches", body: "United States roles from employer career pages, scored against your source resume. International postings never enter the feed." },
  { icon: FileText, title: "Tailor", body: "A per-job copy is rewritten from evidence you already have. Employers, dates, and metrics are never invented." },
  { icon: Cloud, title: "Cloud apply", body: "One click starts an independent worker. Your laptop does not stay open to fill the form." },
  { icon: Receipt, title: "Receipt", body: "Submitted is true only when the ATS confirms it. System-side failures cost zero credits." },
  { icon: Inbox, title: "Inbox", body: "Confirmations land on a dedicated apply-from address. Optional Gmail is read-only." },
];

const adapters = [
  { name: "Greenhouse", kind: "Live submit", note: "Portal receipt required." },
  { name: "Lever", kind: "Live submit", note: "Portal receipt required." },
  { name: "Ashby", kind: "Live submit", note: "Portal receipt required." },
  { name: "Workable", kind: "Live submit", note: "Portal receipt required." },
  { name: "Workday", kind: "Live submit", note: "Uses your vaulted login. Password is never shown again." },
  { name: "Jobvite", kind: "Needs you", note: "Packet prepared. We do not pretend it submitted." },
  { name: "Indeed", kind: "Your login", note: "Connect the account you already own. No fake API submit." },
  { name: "Naukri", kind: "Your login", note: "Same rule. Detection is not a submit." },
];

const desk = [
  { title: "Home + chat rail", body: "Search matches, explain a score, queue one job you chose, open a receipt, tune hands-off, summarize inbox. Tool calls are visible. Off-policy asks are refused." },
  { title: "Job matches", body: "Filters, paste a URL, Pass, Apply, and Apply these matches for the visible top eligible rows." },
  { title: "Applications board", body: "All, Submitted, In flight, Needs you, Failed, Skipped, Review required, Queued. A row opens the packet." },
  { title: "Resume BEFORE / AFTER", body: "The tailored copy plays as lines rewrite. Not a final PDF dropped on a blank page." },
  { title: "Hands-off apply", body: "Search recipes, one daily cap, cadence, min match, Off / Honest / Aggressive, review-before-submit, run history, kill switch." },
  { title: "Recruiter inbox", body: "Dedicated apply-from address plus optional Gmail or Outlook read-only." },
];

const refusals = [
  { icon: Ban, title: "No invented history", body: "The tailor will not add employers, degrees, or metrics you did not provide." },
  { icon: CircleSlash, title: "No silent apply", body: "Nothing leaves the queue unless you click Apply or enable hands-off." },
  { icon: Scale, title: "No fake submitted", body: "Detection is not ability. Unsupported boards stay in Needs you." },
  { icon: Lock, title: "US desk only", body: "We refuse off-policy asks to apply outside the United States." },
];

const faqs = [
  { q: "Do you apply to 500 jobs a day?", a: "No. Starter is 30 credits a month and 10 live submits a day. Autopilot is 250 / 40. Those are ledger numbers, not ads." },
  { q: "What does a credit buy?", a: "One successful portal submit. System-side failures never consume. Needs-you packets are free." },
  { q: "What do influencer codes do?", a: "Stripe promotion codes discount the invoice only. The monthly credit bucket stays the same." },
  { q: "Can I keep my laptop closed?", a: "Yes. Queue, tailor, and live adapters run as cloud jobs. You come back for receipts and Needs you." },
];

export default function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    document.title = "ResumePreps — US job-application desk";
    supabase.auth.getSession().then(({ data: { session } }) => setSignedIn(Boolean(session?.user)));
  }, []);

  return (
    <PublicFrame signedIn={signedIn}>
      <main>
        <section className="mx-auto grid max-w-[1180px] gap-14 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-rp-accent-2">United States · apply engine</p>
            <h1 className="mt-4 max-w-[16ch] font-display text-[52px] font-semibold italic leading-[0.94] tracking-tight sm:text-[72px]">
              Matches in. Receipts out.
            </h1>
            <p className="mt-6 max-w-[46ch] text-[18px] leading-relaxed text-rp-ink-2">
              ResumePreps is a US-only job-application desk. We score roles, tailor a packet from your real history, queue a cloud worker, and write an immutable receipt.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={signedIn ? "/home" : "/auth?mode=signup"} className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-[14px] font-medium text-primary-foreground no-underline">
                {signedIn ? "Open desk" : "Create your desk"} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/how-it-works" className="inline-flex items-center gap-2 rounded-md border border-rp-ink/15 bg-rp-paper px-5 py-3 text-[14px] font-medium no-underline">
                See the pipeline
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-rp-ink-3">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-rp-accent-2" /> Never fake submitted</span>
              <span>1 credit = 1 successful submit</span>
              <span>Promo codes discount the invoice only</span>
            </div>
          </div>
          <ProductTheater />
        </section>

        <section className="border-y border-rp-ink/10 bg-rp-paper py-16">
          <div className="mx-auto max-w-[1180px] px-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-ink-3">The loop</p>
            <h2 className="mt-2 max-w-[22ch] font-display text-[40px] italic leading-none">Matches, tailor, cloud apply, inbox.</h2>
            <ol className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {loop.map((item, index) => {
                const Icon = item.icon;
                return (
                  <li key={item.title} className="rounded-lg border border-rp-ink/10 bg-rp-canvas p-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-rp-paper text-rp-accent-2">
                      <Icon className="h-5 w-5" strokeWidth={1.7} />
                    </div>
                    <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-rp-ink-3">0{index + 1}</p>
                    <h3 className="mt-1 font-display text-[24px] italic leading-tight">{item.title}</h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-rp-ink-2">{item.body}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-[1180px] px-6 py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-ink-3">Live adapters</p>
          <h2 className="mt-2 max-w-[22ch] font-display text-[40px] italic leading-none">Detection is not the same as a submit.</h2>
          <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-rp-ink-2">
            We read the ATS from the URL. That tells you what the posting is. It does not mean we can close the form. Only five adapters write a live receipt today.
          </p>
          <div className="mt-8 overflow-hidden rounded-lg border border-rp-ink/10 bg-rp-paper">
            <table className="w-full text-left text-[14px]">
              <thead className="border-b border-rp-ink/10 font-mono text-[11px] uppercase tracking-[0.12em] text-rp-ink-3">
                <tr>
                  <th className="px-5 py-3">ATS</th>
                  <th className="px-5 py-3">Kind</th>
                  <th className="px-5 py-3">What happens</th>
                </tr>
              </thead>
              <tbody>
                {adapters.map((row) => (
                  <tr key={row.name} className="border-b border-rp-ink/10 last:border-0">
                    <td className="px-5 py-3.5 font-medium">{row.name}</td>
                    <td className="px-5 py-3.5 text-rp-accent-2">{row.kind}</td>
                    <td className="px-5 py-3.5 text-rp-ink-2">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-y border-rp-ink/10 bg-rp-paper py-16">
          <div className="mx-auto max-w-[1180px] px-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-ink-3">The desk</p>
            <h2 className="mt-2 max-w-[20ch] font-display text-[40px] italic leading-none">Every surface is the same product.</h2>
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {desk.map((item) => (
                <article key={item.title} className="rounded-lg border border-rp-ink/10 bg-rp-canvas p-5">
                  <h3 className="font-display text-[24px] italic">{item.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-rp-ink-2">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1180px] px-6 py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-ink-3">Guardrails</p>
          <h2 className="mt-2 max-w-[18ch] font-display text-[40px] italic leading-none">The desk will refuse you.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {refusals.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="flex gap-4 rounded-lg border border-rp-ink/10 bg-rp-paper p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-rp-canvas text-rp-accent-2">
                    <Icon className="h-5 w-5" strokeWidth={1.7} />
                  </div>
                  <div>
                    <h3 className="font-medium">{item.title}</h3>
                    <p className="mt-1 text-[14px] leading-relaxed text-rp-ink-2">{item.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="border-y border-rp-ink/10 bg-rp-paper py-16">
          <div className="mx-auto max-w-[1180px] px-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-ink-3">Plans</p>
            <h2 className="mt-2 font-display text-[40px] italic leading-none">Credits are a ledger, not a marketing number.</h2>
            <div className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {BILLING_PLANS.map((plan) => {
                const bucket = PLAN_CREDIT_BUCKETS[plan.id];
                return (
                  <article key={plan.id} className="rounded-lg border border-rp-ink/10 bg-rp-canvas p-5">
                    <p className="text-[12px] uppercase tracking-[0.12em] text-rp-ink-3">{plan.name}</p>
                    <p className="mt-2 font-display text-[40px] italic">{formatPlanPrice(plan.price)}</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-rp-ink-2">{plan.description}</p>
                    <p className="mt-4 font-mono text-[12px] text-rp-ink-3">
                      {bucket.monthlyCredits} cr · {bucket.dailySubmitCap}/day
                    </p>
                  </article>
                );
              })}
            </div>
            <Link to="/plans" className="mt-6 inline-flex text-[14px] text-rp-accent no-underline">Full plan table →</Link>
          </div>
        </section>

        <section className="mx-auto max-w-[1180px] px-6 py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-ink-3">Questions</p>
          <h2 className="mt-2 font-display text-[40px] italic leading-none">Straight answers.</h2>
          <dl className="mt-10 grid gap-4 md:grid-cols-2">
            {faqs.map((item) => (
              <div key={item.q} className="rounded-lg border border-rp-ink/10 bg-rp-paper p-5">
                <dt className="font-medium">{item.q}</dt>
                <dd className="mt-2 text-[14px] leading-relaxed text-rp-ink-2">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border-t border-rp-ink/10 bg-primary px-6 py-16 text-primary-foreground">
          <div className="mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <h2 className="font-display text-[40px] italic leading-none">Open a United States desk.</h2>
              <p className="mt-3 max-w-[48ch] text-[15px] text-primary-foreground/85">
                Upload a resume, review matches, and only spend a credit when an employer portal confirms the submit.
              </p>
            </div>
            <Link to={signedIn ? "/home" : "/auth?mode=signup"} className="inline-flex items-center gap-2 rounded-md bg-rp-paper px-5 py-3 text-[14px] font-medium text-rp-ink no-underline">
              {signedIn ? "Continue to the desk" : "Create account"} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
    </PublicFrame>
  );
}
