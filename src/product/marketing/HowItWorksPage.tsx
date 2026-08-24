import { MarketingLayout } from "./MarketingLayout";

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
      <main className="mx-auto max-w-[1440px] px-5 py-16 3xl:max-w-[1520px] 3xl:py-20">
        <div className="max-w-2xl">
          <p className="rp-kicker">Sequence</p>
          <h1 className="mt-3 font-display text-display-md">How it works</h1>
          <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
            The pipeline is the product. Marketing, login, and the signed-in desk share one language.
          </p>
        </div>
        <ol className="mt-12 divide-y divide-border border-y border-border">
          {STAGES.map((stage) => (
            <li key={stage.t} className="grid gap-2 py-7 sm:grid-cols-[72px_200px_minmax(0,1fr)] sm:items-baseline">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">{stage.n}</span>
              <h2 className="text-[18px] font-semibold tracking-tight">{stage.t}</h2>
              <p className="max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{stage.d}</p>
            </li>
          ))}
        </ol>
      </main>
    </MarketingLayout>
  );
}
