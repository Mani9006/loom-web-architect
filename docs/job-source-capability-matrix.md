# Job source and application capability matrix

ResumePreps treats job discovery and application submission as separate
capabilities. A provider can expose a public job feed without granting a
third-party service permission to submit applications. We never claim a job is
submitted until the portal returns a receipt.

| Source / ATS | Fresh job discovery | Direct application path | ResumePreps mode |
| --- | --- | --- | --- |
| Greenhouse | Public Job Board API (`GET`) | `POST` application endpoint requires the employer board API key | Direct feed + controlled browser worker; API submission is a future employer-partner adapter |
| Lever | Public Postings API for published jobs | Posting application endpoint requires an authorized Lever API key | Direct feed + controlled browser worker |
| Ashby | Public job-board feed; richer API for customers/partners | Application form submission is an authenticated integration path | Direct feed + controlled browser worker |
| SmartRecruiters | Public Posting API for published jobs | Application API requires partner/customer auth, required screening answers, and privacy consent | Discovery connector candidate; review-only until credentials and consent flow are validated |
| Workday / iCIMS / Jobvite / BambooHR / Workable / Rippling | Usually employer- or partner-specific feeds; no universal free global endpoint | Form/browser flow varies by tenant and may include SSO, CAPTCHA, or custom questions | Allowlisted discovery links; browser worker falls back to `Needs attention` when required fields cannot be safely verified |
| LinkedIn / Indeed / Glassdoor and similar aggregators | Access is governed by each site's terms and partner feeds | No general-purpose public application API for a product like ResumePreps | Not scraped; direct employer/ATS links are preferred |

## Current implementation

- Zero-key direct feeds are enabled for Greenhouse, Ashby, and Lever board
  registries in `supabase/functions/_shared/direct-job-sources.ts`.
- A metered discovery fallback can find additional direct employer/ATS URLs,
  but the URL is passed through the allowlist before it enters the match or
  application pipeline.
- Continuous Apply only submits when the worker has a live task, a matching
  resume packet, all required fields, any requested verification code, and the
  user's current approval policy. Otherwise it records `Needs attention`.
- Gmail is read-only. It is used to classify application messages and to supply
  one short-lived verification code to the matching worker task. OAuth tokens
  remain encrypted server-side and never enter the browser payload.

## What we can add next

1. Add more known employer board slugs to the explicit Greenhouse, Ashby, and
   Lever registries, with health checks and source-level rate limits.
2. Add SmartRecruiters as a partner connector only after we have an approved
   customer/partner token and implement its required privacy/consent questions.
3. Build portal adapters one at a time (Workday, iCIMS, Jobvite, and others),
   keeping unsupported challenges review-only instead of guessing answers.
4. For providers that authorize it, replace browser submission with a signed
   server-side API adapter and retain the same receipt verification and Gmail
   status bridge.

