import { useEffect, useState } from "react";
import { PublicFrame } from "@/components/brand/PublicFrame";
import { supabase } from "@/integrations/supabase/client";

const points = [
  {
    title: "Receipts are evidence",
    body: "A job is submitted only when the ATS confirms it, or when you attest that you finished on the employer site. Detection, scoring, and a tailored PDF are not a submit.",
  },
  {
    title: "Workday vault",
    body: "Passwords are written through a private RPC into app_private. The browser never reads the secret back. Clearing the vault is explicit.",
  },
  {
    title: "Apply-from address",
    body: "Each desk gets a dedicated mailbox for employer mail. Optional Gmail or Outlook is read-only. We do not send from your personal account.",
  },
  {
    title: "Credits are a ledger",
    body: "Reserved, consumed, refunded. System-side failures do not stay charged. Promo codes never mint credits.",
  },
  {
    title: "United States only",
    body: "Matching, enqueue, and hands-off refuse non-US locations. Work authorization is collected as US work auth — not a global relocation product.",
  },
  {
    title: "Chat guardrails",
    body: "The home rail can call tools, but it will not invent work history, mark submitted without a receipt, or apply without your click or an enabled scheduler.",
  },
];

export default function SecurityPage() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    document.title = "Security — ResumePreps";
    supabase.auth.getSession().then(({ data: { session } }) => setSignedIn(Boolean(session?.user)));
  }, []);

  return (
    <PublicFrame signedIn={signedIn}>
      <main className="mx-auto max-w-[860px] px-6 py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-accent-2">Trust</p>
        <h1 className="mt-3 font-display text-[52px] italic leading-[0.94]">Built to stay honest.</h1>
        <p className="mt-5 max-w-[58ch] text-[17px] leading-relaxed text-rp-ink-2">
          ResumePreps is a job-application desk, not a spray-and-pray bot. The product is designed so a green dashboard cannot lie about what the employer saw.
        </p>
        <div className="mt-12 space-y-4">
          {points.map((point) => (
            <article key={point.title} className="rounded-lg border border-rp-ink/10 bg-rp-paper p-6">
              <h2 className="font-display text-[26px] italic">{point.title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-rp-ink-2">{point.body}</p>
            </article>
          ))}
        </div>
      </main>
    </PublicFrame>
  );
}
