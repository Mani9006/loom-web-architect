import LegalLayout, { LegalSection, LegalList, LEGAL_CONTACT_EMAIL } from "@/components/legal/LegalLayout";

export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" subtitle="How ResumePreps collects, uses, and protects your data">
      <LegalSection title="1. Overview">
        <p>
          ResumePreps ("ResumePreps", "we", "us") operates resumepreps.com, an AI-assisted career platform that helps
          you build ATS-clean résumés, find company-direct job openings, prepare tailored application materials, submit
          job applications under your direction, and track outcomes. This Privacy Policy explains what information we
          collect, how we use it, who processes it on our behalf, and the rights you have over your data.
        </p>
        <p>
          By creating an account or using the service, you agree to the practices described here. If you do not agree,
          please do not use the service.
        </p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <p><span className="font-medium text-foreground">Account data.</span> When you sign up we collect your email
        address, name, and authentication credentials. If you sign in with Google, we receive the basic profile
        information Google shares with us (such as your name, email address, and profile photo).</p>
        <p><span className="font-medium text-foreground">Résumé and profile data.</span> You upload or paste résumés,
        cover letters, work history, education, skills, links, and answers to common application questions. We parse
        and store this content so the platform can score, tailor, and prepare application materials for you.</p>
        <p><span className="font-medium text-foreground">Job-application activity.</span> We store the jobs you save,
        the matches we generate, the tailored résumés and cover letters prepared for each posting, your review
        decisions, and, where you enable it, records of applications submitted on your behalf, including the
        employer portal, timestamps, and submission status (prepared, queued, submitted, failed, or skipped).</p>
        <p><span className="font-medium text-foreground">Gmail integration data.</span> If you connect your Gmail
        account, we process limited email data as described in Section 4. Connecting Gmail is optional.</p>
        <p><span className="font-medium text-foreground">Billing data.</span> If you subscribe to a paid plan, payment
        is processed by Stripe. We receive and store your subscription status and transaction identifiers, but we never
        see or store your full card number.</p>
        <p><span className="font-medium text-foreground">Usage data.</span> We collect product-analytics events (for
        example, which features you use) and standard technical logs (IP address, browser type, timestamps) to operate,
        secure, and improve the service.</p>
      </LegalSection>

      <LegalSection title="3. How we use your information">
        <LegalList
          items={[
            "Provide the core service: résumé parsing, ATS scoring, job matching, tailored résumé and cover-letter generation, application preparation and submission, and pipeline tracking.",
            "Personalize matches and recommendations against your résumé story and saved preferences.",
            "Operate billing, account management, and customer support.",
            "Send transactional email (welcome, password reset, application status digests) via our email processor.",
            "Monitor reliability, prevent abuse, and enforce our Terms of Service.",
            "Improve the product using aggregated, de-identified usage patterns.",
          ]}
        />
        <p>We do not sell your personal information, and we do not use your résumé content to advertise to you.</p>
      </LegalSection>

      <LegalSection title="4. Gmail integration (Google user data)">
        <p>
          When you choose to connect Gmail, ResumePreps requests read-only access to your mailbox
          (the <span className="font-mono text-[13px]">gmail.readonly</span> scope). We use this access for exactly two
          purposes, and nothing else:
        </p>
        <LegalList
          items={[
            "One-time verification codes. When an employer or job portal emails you a sign-in or verification code during an application you asked us to help with, we detect that code so the application flow can continue.",
            "Job-application status classification. We scan recent messages related to your job search and classify them into application-status categories, interview invitations, assessment requests, rejections, and offers, so your pipeline tracker stays accurate.",
          ]}
        />
        <p>
          Email content is processed transiently for these purposes. We do not permanently store the bodies of your
          emails; we retain only the derived classification or status event (for example, "Application X moved to
          Interview") and the verification code long enough to complete the sign-in it belongs to. We do not read
          messages unrelated to your job search for any product purpose, and we never send email from your account.
        </p>
        <p>
          You can disconnect Gmail at any time from the Settings page. Disconnecting stops all further access
          immediately, and any remaining Gmail-derived data associated with your account is deleted on request.
        </p>
        <p>
          ResumePreps' use and transfer to any other app of information received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-2 hover:text-foreground/70"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </LegalSection>

      <LegalSection title="5. AI processing of your content">
        <p>
          Core features, résumé tailoring, cover-letter drafting, match scoring, and suggested answers to application
          questions, are powered by large language models. To provide these features, your résumé content, profile
        data, and relevant job descriptions are sent to third-party AI model providers for processing. Depending on
          your plan and current workload, this may include providers operating under free-tier or standard API terms.
        </p>
        <p>
          We instruct these providers through our prompts not to fabricate credentials, employers, dates, or metrics,
          and generated materials are presented to you for review. AI providers process your content only to return the
          requested output to us; we do not permit them to use your content to advertise to you.
        </p>
      </LegalSection>

      <LegalSection title="6. Third-party processors">
        <p>We use the following categories of service providers to operate ResumePreps:</p>
        <LegalList
          items={[
            "Supabase, database, authentication, and file storage for your account, résumés, and application records.",
            "Stripe, payment processing and subscription management for paid plans.",
            "Resend, transactional email delivery (welcome, password reset, and notification emails).",
            "AI model providers, process résumé and job content to generate tailored application materials (see Section 5).",
            "Vercel, hosting and product analytics for the web application.",
          ]}
        />
        <p>
          Each processor handles data only as needed to provide its service to us and is bound by its own security and
          privacy obligations. We do not share your data with employers except when you submit, or direct us to
          submit, an application to them.
        </p>
      </LegalSection>

      <LegalSection title="7. Cookies and similar technologies">
        <p>
          We use a small number of cookies and browser storage entries: authentication session tokens (to keep you
          signed in), preference storage (such as your light/dark theme choice), and privacy-respecting product
          analytics. We do not use third-party advertising cookies or cross-site trackers. You can clear cookies in
          your browser at any time; signing in again will be required afterward.
        </p>
      </LegalSection>

      <LegalSection title="8. Data retention">
        <p>
          We retain your account data, résumés, and application records for as long as your account is active so the
          service can function, your pipeline history and résumé versions are part of the product. Derived Gmail
          classifications are retained as pipeline events; raw email bodies are not permanently stored. Backups and
          logs roll off on their normal retention cycles.
        </p>
      </LegalSection>

      <LegalSection title="9. Your rights and deletion">
        <LegalList
          items={[
            "Access and export: you can view and export your résumés and application history from within the product.",
            "Correction: you can edit your profile, résumés, and saved answers at any time.",
            "Disconnect Gmail: revoke our Gmail access from Settings or from your Google account permissions page.",
            "Deletion: you may request deletion of your account and associated data, including résumés, application records, and Gmail-derived data, by emailing us. We honor deletion requests without undue delay, subject to records we must keep for legal or fraud-prevention reasons.",
          ]}
        />
        <p>
          To exercise any of these rights, contact{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-foreground underline underline-offset-2 hover:text-foreground/70">
            {LEGAL_CONTACT_EMAIL}
          </a>.
        </p>
      </LegalSection>

      <LegalSection title="10. Security">
        <p>
          We use encryption in transit (TLS), managed authentication, row-level access controls on our database, and
          least-privilege access internally. No method of transmission or storage is perfectly secure, but we work to
          protect your information and will notify affected users of any breach as required by applicable law.
        </p>
      </LegalSection>

      <LegalSection title="11. International data transfers">
        <p>
          Our processors may store or process data in the United States and other countries. By using the service you
          understand that your information may be transferred to and processed in jurisdictions whose data-protection
          laws differ from those where you live.
        </p>
      </LegalSection>

      <LegalSection title="12. Children's privacy">
        <p>
          ResumePreps is intended for people seeking employment and is not directed at children under 16. We do not
          knowingly collect personal information from children under 16; if you believe a child has provided us data,
          contact us and we will delete it.
        </p>
      </LegalSection>

      <LegalSection title="13. Changes to this policy">
        <p>
          We may update this Privacy Policy as the product evolves. When we make material changes, we will update the
          effective date above and, where appropriate, notify you by email or in-product notice. The current version is
          always available at resumepreps.com/privacy.
        </p>
      </LegalSection>

      <LegalSection title="14. Contact">
        <p>
          Questions, requests, or concerns about this policy or your data:{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-foreground underline underline-offset-2 hover:text-foreground/70">
            {LEGAL_CONTACT_EMAIL}
          </a>
          {" "}, ResumePreps, resumepreps.com.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
