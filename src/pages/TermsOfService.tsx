import { Link } from "react-router-dom";
import LegalLayout, { LegalSection, LegalList, LEGAL_CONTACT_EMAIL } from "@/components/legal/LegalLayout";

export default function TermsOfService() {
  return (
    <LegalLayout title="Terms of Service" subtitle="The agreement between you and ResumePreps">
      <LegalSection title="1. Acceptance of these terms">
        <p>
          These Terms of Service ("Terms") govern your use of ResumePreps ("ResumePreps", "we", "us"), available at
          resumepreps.com. By creating an account, connecting a third-party service such as Gmail, or using any part of
          the platform, you agree to these Terms and to our{" "}
          <Link to="/privacy" className="text-foreground underline underline-offset-2 hover:text-foreground/70">Privacy Policy</Link>.
          If you do not agree, do not use the service.
        </p>
      </LegalSection>

      <LegalSection title="2. What ResumePreps does">
        <p>ResumePreps is an AI-assisted career platform. The service includes:</p>
        <LegalList
          items={[
            "Résumé builder and ATS checker — draft, parse, score, and export résumés, with job-description-aware keyword analysis.",
            "Job search and matches — fresh, company-direct openings scored against your résumé and preferences.",
            "Application preparation — AI-tailored résumés, cover letters, and suggested answers for specific postings, presented to you for review.",
            "Application submission — at your direction and under the settings you choose, ResumePreps can submit job applications on your behalf to employer portals, using the tailored materials you approved and the answers you provided.",
            "Pipeline tracking — a board of saved, prepared, submitted, and completed applications, with statuses that can be updated automatically when you connect Gmail.",
          ]}
        />
        <p>
          Automated submission happens only after you enable it and only within the limits and review policy you set
          (for example, review-before-submit and daily caps). You remain in control: you can pause automation, review
          every packet before it goes out, and disconnect integrations at any time.
        </p>
      </LegalSection>

      <LegalSection title="3. Eligibility and accounts">
        <p>
          You must be at least 16 years old and capable of forming a binding contract to use ResumePreps. You are
          responsible for keeping your sign-in credentials confidential and for all activity under your account.
          Provide accurate account information and notify us promptly of any unauthorized use.
        </p>
      </LegalSection>

      <LegalSection title="4. Your content and your responsibilities">
        <p>
          You retain ownership of the résumés, cover letters, profile details, and answers you provide ("Your
          Content"). You grant us a limited license to host, process, and transmit Your Content solely to operate the
          service — including sending it to AI model providers to generate tailored materials and to employers when
          you submit an application.
        </p>
        <p>You are responsible for the accuracy of everything submitted in your name. Specifically:</p>
        <LegalList
          items={[
            "The résumé, profile, and answers you provide must be truthful and yours to use.",
            "AI-generated suggestions are drafting aids. You must review tailored résumés, cover letters, and answers before they are submitted, unless you have deliberately enabled auto-submit — and even then you remain responsible for what is sent.",
            "We design the system to avoid fabricated content: our prompts instruct models not to invent employers, dates, credentials, skills, or metrics, and unsupported claims are filtered where detected. We cannot guarantee perfection, so review remains your responsibility.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Acceptable use">
        <p>You agree not to use ResumePreps to:</p>
        <LegalList
          items={[
            "Violate the terms of service of third-party platforms. In particular, do not use the service to scrape, crawl, or automate actions on sites such as LinkedIn or Indeed in ways their terms prohibit.",
            "Bypass, solve programmatically, or circumvent CAPTCHAs or other anti-bot measures on any third-party site.",
            "Submit applications containing false, misleading, or fabricated information, or impersonate another person.",
            "Interfere with the service, probe its security, or access another user's data.",
            "Use the service for any unlawful purpose, or to spam employers with bulk, untargeted applications contrary to your own configured review policy.",
          ]}
        />
        <p>
          Where an employer portal presents a CAPTCHA or explicitly prohibits automation, the correct behavior is to
          stop and hand the application back to you — and that is what we build the product to do.
        </p>
      </LegalSection>

      <LegalSection title="6. Subscriptions and billing">
        <p>
          ResumePreps offers a free plan and paid subscriptions. Paid plans are billed in advance on a recurring
          (monthly or as-stated) basis through our payment processor, Stripe. By subscribing you authorize recurring
          charges until you cancel. You can cancel at any time from the billing settings; cancellation takes effect at
          the end of the current billing period and your plan reverts to the free tier. Fees already paid are
          non-refundable except where required by law. We may change prices with reasonable advance notice; changes
          apply from your next renewal.
        </p>
      </LegalSection>

      <LegalSection title="7. Intellectual property">
        <p>
          The ResumePreps service — its software, design, scoring rubrics, prompts, and branding — is owned by us and
          protected by intellectual-property laws. These Terms give you a personal, non-exclusive, non-transferable
          right to use the service while your account is in good standing. You may not copy, resell, or reverse
          engineer the service except as permitted by law. Your Content remains yours, as described in Section 4.
        </p>
      </LegalSection>

      <LegalSection title="8. Third-party sites and services">
        <p>
          ResumePreps links to and interacts with third-party services — employer career portals, job boards, Google
          (Gmail), Stripe, and AI model providers. Those services are governed by their own terms and privacy policies.
          We are not responsible for third-party content, availability, or decisions, including any employer's
          response to your application.
        </p>
      </LegalSection>

      <LegalSection title="9. Disclaimers">
        <p>
          The service is provided "as is" and "as available", without warranties of any kind, express or implied,
          including merchantability, fitness for a particular purpose, and non-infringement. Without limiting that:
        </p>
        <LegalList
          items={[
            "No employment guarantee. ResumePreps does not guarantee interviews, offers, or employment of any kind. Hiring decisions belong solely to employers.",
            "ATS scores, match scores, and AI suggestions are informational aids, not professional career, legal, or financial advice.",
            "We do not warrant that job listings are accurate, current, or still open, or that any application will be received, read, or answered.",
            "Automated features depend on third-party portals and integrations that may change or fail without notice.",
          ]}
        />
      </LegalSection>

      <LegalSection title="10. Limitation of liability">
        <p>
          To the maximum extent permitted by law, ResumePreps and its operators will not be liable for any indirect,
          incidental, special, consequential, or punitive damages — including lost job opportunities, lost income, lost
          data, or reputational harm — arising from or related to your use of the service. Our aggregate liability for
          any claim relating to the service is limited to the amount you paid us in the twelve months before the event
          giving rise to the claim, or, if you paid nothing, one hundred US dollars (US$100). Some jurisdictions do not
          allow these limits; in that case they apply to the fullest extent permitted.
        </p>
      </LegalSection>

      <LegalSection title="11. Indemnification">
        <p>
          You agree to indemnify and hold harmless ResumePreps from claims, damages, and expenses (including
          reasonable legal fees) arising out of Your Content, your breach of these Terms, your violation of any
          third party's rights or terms — including the terms of job boards and employer portals — or applications
          submitted under your account with information you provided or approved.
        </p>
      </LegalSection>

      <LegalSection title="12. Termination">
        <p>
          You may stop using the service and delete your account at any time. We may suspend or terminate access if
          you breach these Terms, use the service unlawfully, or create risk for us or other users — with notice where
          practicable. On termination, your right to use the service ends; provisions that by their nature should
          survive (including ownership, disclaimers, limitation of liability, and indemnification) survive. Your data
          is handled after termination as described in the Privacy Policy, and you may request deletion at any time.
        </p>
      </LegalSection>

      <LegalSection title="13. Changes to these terms">
        <p>
          We may update these Terms as the service evolves. For material changes we will update the effective date and
          provide reasonable notice by email or in-product message. Continued use after changes take effect constitutes
          acceptance. The current version is always available at resumepreps.com/terms.
        </p>
      </LegalSection>

      <LegalSection title="14. General">
        <p>
          These Terms, together with the Privacy Policy, are the entire agreement between you and ResumePreps
          regarding the service. If any provision is found unenforceable, the remainder stays in effect. Our failure
          to enforce a provision is not a waiver. These Terms are governed by the laws of the jurisdiction in which
          the operator of ResumePreps is established, without regard to conflict-of-law principles, and any dispute
          will be brought in the courts of that jurisdiction unless applicable consumer law gives you another forum.
        </p>
      </LegalSection>

      <LegalSection title="15. Contact">
        <p>
          Questions about these Terms:{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-foreground underline underline-offset-2 hover:text-foreground/70">
            {LEGAL_CONTACT_EMAIL}
          </a>
          {" "}— ResumePreps, resumepreps.com.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
