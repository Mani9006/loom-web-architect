import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MarketingLayout } from "./MarketingLayout";

const STEPS = [
  { n: "01", t: "Upload a source resume", d: "We parse what you actually did. Tailoring cannot invent employers, dates, or metrics." },
  { n: "02", t: "See US matches with a % ring", d: "United States roles only. Pass or apply. Batch apply hits the visible top set." },
  { n: "03", t: "Watch the cloud queue", d: "Queued → tailoring → filling → Submitted. Submitted waits for a worker receipt." },
  { n: "04", t: "Keep the recruiter inbox", d: "A dedicated apply-from address plus classified threads: verification through offer." },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    document.title = "ResumePreps — US job applications with receipts";
    supabase.auth.getSession().then(({ data }) => setInApp(Boolean(data.session)));
  }, []);

  return (
    <MarketingLayout>
      <main className="mx-auto max-w-[1120px] px-5">
        <section className="grid items-center gap-10 py-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-primary">ResumePreps · United States</p>
            <h1 className="mt-3 text-[44px] font-semibold leading-[1.05] tracking-[-0.03em]">
              Apply at depth.<br />Never fake submitted.
            </h1>
            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
              A graphite operations desk for US job search: ranked matches, one-click apply through a cloud queue, recruiter inbox, pipeline, and hands-off apply with a shared daily cap.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" className="h-11 rounded-md bg-primary px-4 text-[14px] font-medium text-primary-foreground" onClick={() => navigate(inApp ? "/home" : "/auth?mode=signup")}>
                {inApp ? "Open Home" : "Create account"}
              </button>
              <button type="button" className="h-11 rounded-md border border-border px-4 text-[14px]" onClick={() => navigate("/how-it-works")}>See the pipeline</button>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-elevated">
            <div className="flex items-center justify-between text-[12px] text-muted-foreground">
              <span>Top match</span>
              <span className="tabular-nums text-primary font-semibold">91</span>
            </div>
            <p className="mt-2 text-[15px] font-semibold">Analytics Engineer</p>
            <p className="text-[12px] text-muted-foreground">Northwind · Remote US</p>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[11px]">
              {["Queued", "Tailor", "Fill", "Receipt"].map((s, i) => (
                <div key={s} className={`rounded-md py-2 ${i === 3 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{s}</div>
              ))}
            </div>
            <p className="mt-4 text-[12px] text-muted-foreground">Credit ledger: 1 successful submit = 1 credit. Failures refund.</p>
          </div>
        </section>

        <section className="grid gap-4 py-8 md:grid-cols-4">
          {STEPS.map((step) => (
            <article key={step.n} className="rounded-xl border border-border bg-card p-4">
              <p className="font-mono text-[11px] text-primary">{step.n}</p>
              <h2 className="mt-2 text-[15px] font-semibold">{step.t}</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{step.d}</p>
            </article>
          ))}
        </section>
      </main>
    </MarketingLayout>
  );
}
