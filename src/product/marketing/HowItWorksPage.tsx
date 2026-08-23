import { MarketingLayout } from "./MarketingLayout";

const STAGES = [
  { t: "Scan", d: "US career-page sources (Greenhouse, Lever, Ashby, Workable) land in scanned_jobs." },
  { t: "Score", d: "Deterministic career-fit first. The model explains; it cannot clear a hard block." },
  { t: "Tailor", d: "Old bullets → new bullets, claims locked to your source resume." },
  { t: "Queue", d: "career-ops-submit enqueues a worker task. This is not submitted." },
  { t: "Fill", d: "Live adapters fill Greenhouse, Lever, Ashby, Workable. Workday and Jobvite stay Needs you." },
  { t: "Receipt", d: "Only a confirmed portal outcome writes submitted and spends one credit." },
  { t: "Inbox", d: "Verification, rejection, interview, assessment, reminder, offer, applied." },
  { t: "Pipeline", d: "Applied / Ghosted / Interviewing / Rejected / Offer with import and export." },
];

export default function HowItWorksPage() {
  return (
    <MarketingLayout>
      <main className="mx-auto max-w-[800px] px-5 py-14">
        <h1 className="text-[36px] font-semibold tracking-[-0.03em]">How it works</h1>
        <p className="mt-3 text-[15px] text-muted-foreground">The pipeline is the product. Same design system as the signed-in app.</p>
        <ol className="mt-10 space-y-4">
          {STAGES.map((stage, i) => (
            <li key={stage.t} className="grid grid-cols-[48px_1fr] gap-4 rounded-xl border border-border bg-card p-4">
              <span className="font-mono text-[13px] text-primary">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h2 className="text-[16px] font-semibold">{stage.t}</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">{stage.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </main>
    </MarketingLayout>
  );
}
