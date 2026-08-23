import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cloud, FileSearch, Inbox, ListChecks, Receipt, Shield } from "lucide-react";
import { PublicFrame } from "@/components/brand/PublicFrame";
import { ProductTheater } from "@/components/brand/ProductTheater";
import { supabase } from "@/integrations/supabase/client";

const stages = [
  { icon: FileSearch, title: "Detect the ATS", body: "We read the job URL. Greenhouse is not the same as Jobvite. Detection never implies we can submit. The label on Job matches is informational until a worker writes a receipt." },
  { icon: ListChecks, title: "Queue", body: "Apply starts an independent cloud job. Status: queued — waiting for a free worker. Batch is capped at 60. Per-user running jobs are capped at 12. Global running is capped at 120." },
  { icon: Cloud, title: "Worker", body: "The worker tailors the resume from your source profile, fills the form, and pauses on ATSes that require review. Your browser is not the worker." },
  { icon: Receipt, title: "Receipt", body: "Immutable. submitted=true only with portal evidence, or your explicit attestation that you finished on the employer site. System failures refund or never charge." },
  { icon: Inbox, title: "Apply-from mail", body: "The employer sees a dedicated address. Confirmations, codes, and rejections land in Recruiter inbox. Optional Gmail is read-only." },
  { icon: Shield, title: "Needs you", body: "Unsupported boards, logins, CAPTCHA, and missing answers stay honest. We do not fake a win to keep a dashboard green." },
];

const lifecycle = [
  { status: "Queued", meaning: "Accepted into the cloud queue. No credit spent." },
  { status: "Tailoring resume", meaning: "A per-job copy is being rewritten from evidence you already have." },
  { status: "Filling form", meaning: "A live adapter is completing the employer form." },
  { status: "Review required", meaning: "The ATS paused for a human check you configured." },
  { status: "Needs you", meaning: "We cannot finish honestly. Packet is ready; you close it." },
  { status: "Submitted", meaning: "A receipt exists. One credit consumed." },
  { status: "Failed", meaning: "System-side. Credit returned or never reserved." },
  { status: "Skipped", meaning: "Policy, duplicate, expired posting, or you passed." },
];

export default function HowItWorksPage() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    document.title = "How it works — ResumePreps";
    supabase.auth.getSession().then(({ data: { session } }) => setSignedIn(Boolean(session?.user)));
  }, []);

  return (
    <PublicFrame signedIn={signedIn}>
      <main>
        <section className="mx-auto max-w-[1180px] px-6 py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-accent-2">Apply pipeline</p>
          <h1 className="mt-3 max-w-[16ch] font-display text-[52px] italic leading-[0.94] sm:text-[64px]">Queue, worker, ATS, receipt.</h1>
          <p className="mt-5 max-w-[62ch] text-[17px] leading-relaxed text-rp-ink-2">
            This is the product. Not a job board. A United States application engine that only spends a credit when the employer portal confirms the submit.
          </p>
          <div className="mt-10"><ProductTheater /></div>
        </section>

        <section className="border-y border-rp-ink/10 bg-rp-paper py-16">
          <div className="mx-auto max-w-[960px] px-6">
            <ol className="space-y-4">
              {stages.map((stage, index) => {
                const Icon = stage.icon;
                return (
                  <li key={stage.title} className="grid gap-4 rounded-lg border border-rp-ink/10 bg-rp-canvas p-6 sm:grid-cols-[72px_1fr] sm:items-start">
                    <div className="flex h-14 w-14 items-center justify-center rounded-md bg-rp-paper text-rp-accent-2">
                      <Icon className="h-6 w-6" strokeWidth={1.7} />
                    </div>
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-rp-ink-3">Stage {index + 1}</p>
                      <h2 className="mt-1 font-display text-[28px] italic">{stage.title}</h2>
                      <p className="mt-2 text-[15px] leading-relaxed text-rp-ink-2">{stage.body}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-[1180px] px-6 py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-ink-3">Statuses</p>
          <h2 className="mt-2 font-display text-[40px] italic leading-none">What each word on the board means.</h2>
          <div className="mt-8 overflow-hidden rounded-lg border border-rp-ink/10 bg-rp-paper">
            <table className="w-full text-left text-[14px]">
              <thead className="border-b border-rp-ink/10 font-mono text-[11px] uppercase tracking-[0.12em] text-rp-ink-3">
                <tr>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {lifecycle.map((row) => (
                  <tr key={row.status} className="border-b border-rp-ink/10 last:border-0">
                    <td className="px-5 py-3.5 font-medium">{row.status}</td>
                    <td className="px-5 py-3.5 text-rp-ink-2">{row.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6 max-w-[70ch] text-[14px] leading-relaxed text-rp-ink-2">
            Hands-off apply uses the same queue. Recipes share one daily cap. The kill switch cancels in-flight hands-off jobs. Clicking Apply on Job matches does not require the scheduler to be on.
          </p>
          <Link to="/plans" className="mt-4 inline-flex text-[14px] text-rp-accent no-underline">See credit buckets →</Link>
        </section>
      </main>
    </PublicFrame>
  );
}
