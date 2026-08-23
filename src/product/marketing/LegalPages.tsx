import { MarketingLayout } from "./MarketingLayout";

export function TermsPage() {
  return (
    <MarketingLayout>
      <main className="mx-auto max-w-3xl px-5 py-20">
        <p className="text-caption text-primary">Legal</p>
        <h1 className="mt-4 font-display text-5xl">Terms of service</h1>
        <div className="mt-8 space-y-4 text-body text-muted-foreground">
          <p>ResumePreps provides software to search United States jobs, tailor materials from your source resume, and submit applications through supported ATS adapters.</p>
          <p>Submitted means a verified receipt. We do not sell a guarantee of interviews or offers. You remain responsible for the accuracy of the source resume you upload.</p>
          <p>Hands-off apply requires an explicit enable. Credits decrement on successful submits and refund on system failure. Promotional Stripe codes issue invoices only.</p>
          <p>Contact legal@resumepreps.com for notices.</p>
        </div>
      </main>
    </MarketingLayout>
  );
}

export function PrivacyPage() {
  return (
    <MarketingLayout>
      <main className="mx-auto max-w-3xl px-5 py-20">
        <p className="text-caption text-primary">Legal</p>
        <h1 className="mt-4 font-display text-5xl">Privacy policy</h1>
        <div className="mt-8 space-y-4 text-body text-muted-foreground">
          <p>We store your account, resumes, application packets, inbox metadata, and credit ledger on Supabase. Auth uses Supabase Auth (email or Google).</p>
          <p>Gmail and Outlook connections are optional. Tokens are encrypted at rest. We request the minimum mail scopes needed to classify recruiter messages and extract verification codes.</p>
          <p>Workday vault secrets never render in the browser. We do not sell personal information.</p>
          <p>Contact privacy@resumepreps.com.</p>
        </div>
      </main>
    </MarketingLayout>
  );
}
