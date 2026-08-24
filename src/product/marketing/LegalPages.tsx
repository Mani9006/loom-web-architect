import type { ReactNode } from "react";
import { MarketingLayout } from "./MarketingLayout";
import { DeskPreview } from "./DeskPreview";

function LegalShell({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <MarketingLayout>
      <main className="mx-auto grid max-w-[1440px] gap-6 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_360px] 3xl:max-w-[1520px]">
        <article>
          <p className="rp-kicker">{kicker}</p>
          <h1 className="mt-2 font-display text-display-md">{title}</h1>
          <div className="rp-panel mt-6 space-y-4 p-5 text-[14px] leading-7 text-muted-foreground">{children}</div>
        </article>
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <DeskPreview variant="receipt" />
        </aside>
      </main>
    </MarketingLayout>
  );
}

export function TermsPage() {
  return (
    <LegalShell kicker="Legal" title="Terms of service">
      <p>ResumePreps provides software to search United States jobs, tailor materials from your source resume, and submit applications through supported ATS adapters.</p>
      <p>Submitted means a verified receipt. We do not sell a guarantee of interviews or offers. You remain responsible for the accuracy of the source resume you upload.</p>
      <p>Hands-off apply requires an explicit enable. Credits decrement on successful submits and refund on system failure. Promotional Stripe codes issue invoices only.</p>
      <p>Contact legal@resumepreps.com for notices.</p>
    </LegalShell>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell kicker="Legal" title="Privacy policy">
      <p>We store your account, resumes, application packets, inbox metadata, and credit ledger on Supabase. Auth uses Supabase Auth (email or Google).</p>
      <p>Gmail and Outlook connections are optional. Tokens are encrypted at rest. We request the minimum mail scopes needed to classify recruiter messages and extract verification codes.</p>
      <p>Workday vault secrets never render in the browser. We do not sell personal information.</p>
      <p>Contact privacy@resumepreps.com.</p>
    </LegalShell>
  );
}
