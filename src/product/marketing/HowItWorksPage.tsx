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
      <main className="mx-auto max-w-6xl px-5 py-20">
        <p className="text-caption text-primary">Sequence</p>
        <h1 className="mt-4 font-display text-5xl">How it works</h1>
        <p className="mt-5 max-w-xl text-body text-muted-foreground">
          The pipeline is the product. Marketing, login, and the signed-in desk share one language.
        </p>
        <ol className="mt-16 divide-y divide-border border-y border-border">
          {STAGES.map((stage) => (
            <li key={stage.t} className="grid gap-4 py-8 md:grid-cols-[80px_180px_1fr] md:items-baseline">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">{stage.n}</span>
              <h2 className="font-display text-2xl">{stage.t}</h2>
              <p className="text-body text-muted-foreground">{stage.d}</p>
            </li>
          ))}
        </ol>
      </main>
    </MarketingLayout>
  );
}
