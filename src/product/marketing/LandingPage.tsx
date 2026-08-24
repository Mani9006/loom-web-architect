import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { MarketingLayout } from "./MarketingLayout";
import { DeskPreview } from "./DeskPreview";

const STATES = [
  ["Queued", "Worker task enqueued. Not submitted."],
  ["Filling", "A live adapter is on Greenhouse, Lever, Ashby, or Workable."],
  ["Submitted", "Portal receipt on file. One credit spent."],
  ["Needs you", "Unsupported ATS or a field only you can finish."],
  ["Failed", "Error recorded. Not submitted. System failures refund."],
];

const ATS = [
  ["Greenhouse", "Live", "On receipt"],
  ["Lever", "Live", "On receipt"],
  ["Ashby", "Live", "On receipt"],
  ["Workable", "Live", "On receipt"],
  ["Workday", "Needs you", "Never without a receipt"],
  ["Jobvite", "Needs you", "Never without a receipt"],
];

export default function LandingPage() {
  return (
    <MarketingLayout>
      <main>
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-[1440px] items-stretch gap-6 px-5 py-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:py-9 3xl:max-w-[1520px]">
            <div>
              <p className="rp-kicker">United States jobs</p>
              <h1 className="mt-4 max-w-3xl font-display text-display">
                Apply to the right US jobs. Never invent the past.
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted-foreground">
                ResumePreps finds United States roles, writes a truthful application from your resume, and only marks
                Submitted after a worker receipt. Hands-off apply stays off until you confirm.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link to="/auth?mode=signup" className="rp-btn rp-btn-primary rp-btn-lg no-underline">
                  Create account
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/how-it-works" className="rp-btn rp-btn-ghost rp-btn-lg no-underline">
                  See the sequence
                </Link>
              </div>
              <dl className="mt-8 grid max-w-lg grid-cols-3 gap-4 border-t border-border pt-5">
                {[
                  ["ATS", "Greenhouse, Lever, Ashby, Workable"],
                  ["Submitted", "Worker receipt only"],
                  ["Credits", "One successful send"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-[13px] leading-snug">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <DeskPreview />
          </div>
        </section>

        <section className="mx-auto grid max-w-[1440px] gap-4 px-5 py-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] 3xl:max-w-[1520px]">
          <div className="rp-panel p-5">
            <p className="rp-kicker">Sequence</p>
            <h2 className="mt-2 text-[18px] font-semibold tracking-tight">Match. Write. Send.</h2>
            <ol className="mt-4 divide-y divide-border border-t border-border">
              {[
                ["01", "Match", "US titles, cities, and remote-US roles. Canada and overseas stay out."],
                ["02", "Write", "Tailor from your uploaded resume. Missing facts stay missing."],
                ["03", "Send", "Queue one job or enable hands-off. Submitted waits for the worker."],
              ].map(([n, title, copy]) => (
                <li key={title} className="grid gap-1 py-3 sm:grid-cols-[48px_88px_minmax(0,1fr)] sm:items-baseline">
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">{n}</span>
                  <h3 className="text-[14px] font-semibold">{title}</h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{copy}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="rp-panel-flush">
            <div className="border-b border-border px-4 py-3">
              <p className="rp-kicker">Application states</p>
              <h2 className="mt-1 text-[15px] font-semibold tracking-tight">What each status actually means</h2>
            </div>
            <table className="rp-table">
              <thead>
                <tr>
                  <th>State</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                {STATES.map(([state, meaning]) => (
                  <tr key={state}>
                    <td className="font-medium">{state}</td>
                    <td className="text-muted-foreground">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1440px] gap-4 px-5 pb-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] 3xl:max-w-[1520px]">
          <div className="rp-panel-flush">
            <div className="border-b border-border px-4 py-3">
              <p className="rp-kicker">Adapters</p>
              <h2 className="mt-1 text-[15px] font-semibold tracking-tight">Where the worker can submit</h2>
            </div>
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Portal</th>
                  <th>Submit</th>
                  <th>Credit</th>
                </tr>
              </thead>
              <tbody>
                {ATS.map(([portal, submit, credit]) => (
                  <tr key={portal}>
                    <td className="font-medium">{portal}</td>
                    <td>{submit}</td>
                    <td className="text-muted-foreground">{credit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DeskPreview variant="receipt" />
        </section>
      </main>
    </MarketingLayout>
  );
}
