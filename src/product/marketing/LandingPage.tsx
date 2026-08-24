import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { MarketingLayout } from "./MarketingLayout";

export default function LandingPage() {
  return (
    <MarketingLayout>
      <main>
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-[1440px] items-end gap-12 px-5 py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:py-20 3xl:max-w-[1520px] 3xl:py-24">
            <div>
              <p className="rp-kicker">United States jobs</p>
              <h1 className="mt-5 max-w-3xl font-display text-display">
                Apply to the right US jobs. Never invent the past.
              </h1>
              <p className="mt-6 max-w-xl text-[16px] leading-7 text-muted-foreground">
                ResumePreps finds United States roles, writes a truthful application from your resume, and only marks
                Submitted after a worker receipt. Hands-off apply stays off until you confirm.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/auth?mode=signup" className="rp-btn rp-btn-primary rp-btn-lg no-underline">
                  Create account
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/how-it-works" className="rp-btn rp-btn-ghost rp-btn-lg no-underline">
                  See the sequence
                </Link>
              </div>
              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-border pt-6">
                {[
                  ["ATS", "Greenhouse, Lever, Ashby, Workable"],
                  ["Submitted", "Worker receipt only"],
                  ["Credits", "One successful send"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</dt>
                    <dd className="mt-1.5 text-[13px] leading-snug">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-5 py-16 3xl:max-w-[1520px]">
          <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <p className="rp-kicker">Sequence</p>
              <h2 className="mt-3 font-display text-display-md">Match. Write. Send.</h2>
            </div>
            <ol className="divide-y divide-border border-y border-border">
              {[
                ["01", "Match", "US titles, cities, and remote-US roles. Canada and overseas stay out."],
                ["02", "Write", "Tailor from your uploaded resume. Missing facts stay missing."],
                ["03", "Send", "Queue one job or enable hands-off. Submitted waits for the worker."],
              ].map(([n, title, copy]) => (
                <li key={title} className="grid gap-2 py-6 sm:grid-cols-[72px_160px_minmax(0,1fr)] sm:items-baseline">
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">{n}</span>
                  <h3 className="text-[16px] font-semibold tracking-tight">{title}</h3>
                  <p className="text-[14px] leading-relaxed text-muted-foreground">{copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}

function ProductPreview() {
  return (
    <div className="rp-panel-flush shadow-md">
      <div className="flex h-10 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-[3px] rounded-sm bg-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">Desk</span>
        </div>
        <div className="flex gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-border" />
          <span className="h-1.5 w-1.5 rounded-full bg-border" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
        </div>
      </div>
      <div className="grid min-h-[320px] md:grid-cols-[1.15fr_0.85fr]">
        <div className="border-b border-border p-4 md:border-b-0 md:border-r">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Top matches</p>
          <ul className="mt-3 space-y-3">
            {[
              ["Staff Data Analyst", "Stripe · Remote US", "92"],
              ["Analytics Engineer", "Notion · NYC", "87"],
              ["Product Analyst", "Linear · Hybrid", "81"],
            ].map(([title, meta, score]) => (
              <li key={title} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                <div>
                  <p className="text-[13px] font-medium">{title}</p>
                  <p className="text-[12px] text-muted-foreground">{meta}</p>
                </div>
                <span className="font-mono text-[12px] text-primary">{score}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Applications</p>
          <div className="mt-3 space-y-2">
            {[
              ["Queued", "Not submitted"],
              ["Filling", "Greenhouse"],
              ["Submitted", "Receipt on file"],
            ].map(([status, note]) => (
              <div key={status} className="rounded-md border border-border px-3 py-2.5">
                <p className="text-[13px] font-medium">{status}</p>
                <p className="text-[12px] text-muted-foreground">{note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="border-t border-border px-4 py-2.5 text-[12px] text-muted-foreground">
        What Submitted means: a Greenhouse, Lever, Ashby, or Workable receipt. Nothing else.
      </p>
    </div>
  );
}
