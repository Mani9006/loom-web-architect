import { MarketingLayout } from "./MarketingLayout";
import { DeskPreview } from "./DeskPreview";

const STAGES = [
  { n: "01", t: "Scan", d: "US career-page sources — Greenhouse, Lever, Ashby, Workable — land in scanned_jobs." },
  { n: "02", t: "Score", d: "Deterministic career-fit first. The model explains. It cannot clear a hard block." },
  { n: "03", t: "Write", d: "Old bullets become new bullets. Claims stay locked to your uploaded resume." },
  { n: "04", t: "Queue", d: "career-ops-submit enqueues a worker task. Queued is not submitted." },
  { n: "05", t: "Fill", d: "Live adapters fill Greenhouse, Lever, Ashby, Workable. Workday and Jobvite stay Needs you." },
  { n: "06", t: "Receipt", d: "Only a confirmed portal outcome writes submitted and spends one credit." },
  { n: "07", t: "Inbox", d: "Verification, rejection, interview, assessment, reminder, offer, applied." },
  { n: "08", t: "Pipeline", d: "Applied, Ghosted, Interviewing, Rejected, Offer — with import and export." },
];

export default function HowItWorksPage() {
  return (
    <MarketingLayout>
      <main className="mx-auto grid max-w-[1440px] gap-4 px-5 py-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] 3xl:max-w-[1520px]">
        <div>
          <p className="rp-kicker">Sequence</p>
          <h1 className="mt-2 font-display text-display-md">How it works</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-7 text-muted-foreground">
            The pipeline is the product. Marketing, login, and the signed-in desk share one language.
          </p>
          <ol className="rp-panel-flush mt-6 divide-y divide-border">
            {STAGES.map((stage) => (
              <li key={stage.t} className="grid gap-1 px-4 py-3 sm:grid-cols-[48px_140px_minmax(0,1fr)] sm:items-baseline">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">{stage.n}</span>
                <h2 className="text-[15px] font-semibold tracking-tight">{stage.t}</h2>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{stage.d}</p>
              </li>
            ))}
          </ol>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <DeskPreview variant="receipt" />
          <div className="rp-well p-4">
            <p className="text-[12px] font-medium">Submitted never means queued or filling.</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">The worker writes that state only after a confirmed Greenhouse, Lever, Ashby, or Workable outcome.</p>
          </div>
        </aside>
      </main>
    </MarketingLayout>
  );
}
