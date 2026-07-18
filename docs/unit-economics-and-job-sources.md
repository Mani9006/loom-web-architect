# ResumePreps unit economics and job-source plan

Updated: 2026-07-18

This is the launch cost model, not a claim that every integration is already production-ready. The pricing gate should not be enabled until the usage meters and hard caps in this document are enforced server-side.

## Margin rule

Gross margin is calculated per paid account as:

`(subscription revenue - payment fees - variable usage - allocated platform cost) / subscription revenue`

The launch floor is 50% in the defined worst case, before founder salary, paid acquisition, taxes, refunds, and customer-support labor. A plan that only clears 50% at average usage is not safe.

## What the current market charges

| Product | Public price observed | Included volume / positioning | Source |
| --- | ---: | --- | --- |
| Tsenta | $19 / $39 / $99 monthly | 600 / 1,500 / 4,500 applications per 30 days; first 25 free | [Tsenta pricing](https://tsenta.com/) |
| Sprout | $19.99 / $39.99 / $79.99 monthly | 80 / 200 / 600 applications per month | [Sprout pricing](https://www.usesprout.com/pricing) |
| Simplify+ | $19.99 week, $39.99 month, $89.99 three months | Same AI feature suite; duration changes | [Simplify+ pricing](https://help.simplify.jobs/en/help/articles/5623502-whats-included-in-simplify-features-and-pricing) |
| Hustle Hive | $229 monthly | Up to 25 applications/day with a human supervisor | [Hustle Hive Copilot](https://hustlehive.ai/products/ai-job-copilot) |
| ApplyRight | EUR 13.30 / EUR 19.90 monthly | Pro and Career+; public page advertises unlimited auto-apply | [ApplyRight pricing](https://applyright.io/) |

Jobright Turbo pricing was visible in the authenticated product audit but was not available on a stable first-party public pricing page. Treat any remembered figure as unverified and re-check it before using it in marketing.

Competitor volume is not proof that the same volume is economical for ResumePreps. Products can use local browser extensions, deterministic ATS adapters, venture-subsidized pricing, different model quality, or looser matching. Our promise should be fewer, explainable, evidence-backed applications until our measured cost and interview conversion support higher caps.

## Vendor cost ledger

### Fixed or shared monthly services

| Service | Launch choice | Cost / included use | Decision |
| --- | --- | --- | --- |
| Vercel | Pro | $20/month with $20 usage credit. Hobby is for personal, non-commercial use. | Keep Vercel. Set a hard spend limit; do not add Kubernetes. [Pricing](https://vercel.com/pricing) |
| Supabase | Pro for production | $25/month; 100k MAU, 8 GB database, 250 GB egress, 100 GB storage included | Keep production on Pro; dev may remain Free. [Pricing](https://supabase.com/pricing) |
| GitHub Actions | GitHub Free | 2,000 minutes/month for private repos; standard runners are free for public repos | Use the existing Actions quality gate. Do not add Jenkins. [Billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) |
| Resend | Free, then Pro | Free: 3,000 emails/month and 100/day. Pro: $20 for 50,000; $0.90/1,000 overage. | Keep transactional mail concise and meter it. [Pricing](https://resend.com/pricing) |
| Browserbase | Free for proof, Developer for pilot, Startup for production volume | Developer: $20, 100 browser hours, then $0.12/hour, 1 GB proxies then $12/GB. Startup: $99, 500 hours. | Use only for supported cloud runs. Prefer deterministic adapters and eventually a user-local extension. [Pricing](https://www.browserbase.com/pricing) |

Minimum dependable commercial base is about $45/month for Vercel + Supabase. The browser pilot raises it to about $65/month. Resend remains $0 until the free quota is exhausted. At 10 paying accounts, $45 is $4.50 allocated cost per account; at 25 it is $1.80; at 100 it is $0.45.

Kubernetes itself is open source, but a production cluster still needs control-plane/worker compute, networking, monitoring, patching, and an operator. The official production guide explicitly calls out resilient control planes and worker resources. That is additional cost and failure surface for a Vercel + Supabase application, so it is deferred until a measured workload cannot run economically on managed/serverless infrastructure. [Kubernetes production guidance](https://kubernetes.io/docs/setup/production-environment/)

### Usage-priced services

| Service | Published unit price | How ResumePreps should use it |
| --- | --- | --- |
| OpenAI GPT-5.4 nano | $0.20/M input, $1.25/M output, $0.02/M cached input | Classification, extraction, job/resume fit, dedupe, routing, short structured answers. [Model pricing](https://developers.openai.com/api/docs/models/gpt-5.4-nano) |
| OpenAI GPT-5.4 mini | $0.75/M input, $4.50/M output | Resume tailoring and longer evidence-backed writing only. [Model announcement/pricing](https://openai.com/index/introducing-gpt-5-4-mini-and-nano/) |
| OpenAI Batch | 50% token discount, asynchronous within 24 hours | Nightly matching, re-scoring, analytics, non-interactive preparation. [Batch API](https://platform.openai.com/docs/api-reference/batch/object?api-mode=responses) |
| Exa Search | Free up to 20k requests/month; then $7/1k search requests and $1/1k pages per requested content type | Cache centrally. Never run multiple content-heavy Exa calls for every user refresh. [Pricing](https://exa.ai/pricing?tab=api) |
| Perplexity Sonar / Sonar Pro | Sonar $1/M input + output plus $5-$12/1k requests; Sonar Pro $3/M input, $15/M output plus $6-$14/1k requests | Remove from normal job browsing. Reserve for explicit research or a cache miss with a paid credit. [Pricing](https://docs.perplexity.ai/docs/getting-started/pricing) |
| SerpApi Google Jobs | Free 250 searches; $25/1k, $75/5k, $150/15k | Optional expansion source after direct ATS feeds; cache by query/location. [Pricing](https://serpapi.com/pricing) |
| Adzuna | Default 2,500 calls/month; commercial use after trial requires an agreement | Useful during validation; obtain written commercial terms before launch. [API terms](https://developer.adzuna.com/docs/terms_of_service) |
| JSearch on RapidAPI | Free 200 requests; Mega listing starts $300/500k requests | Do not make this a launch dependency. The free quota is insufficient for the current daily loop. [Pricing](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch-mega/pricing) |
| Stripe | 2.9% + $0.30 domestic card; Billing starts at 0.7% of recurring volume | Include both Payments and Billing in plan math. [Payments](https://stripe.com/pricing), [Billing](https://stripe.com/billing/pricing) |

Mem0 is currently in the job-search path, but its hosted price was not sufficiently transparent in the current first-party material. Candidate preferences and answer memory already fit the product database; keep them in Supabase and use Postgres search/embeddings before adding another metered vendor.

## Free and paid job sources

Start with public, read-only, employer-owned feeds. They are the cheapest and most reliable source of canonical apply URLs:

| Source | Discovery access | Submission reality | Launch use |
| --- | --- | --- | --- |
| Greenhouse Job Board API | Public job listings and job details/questions | Application POST needs the employer's job-board API key; it is not a universal third-party submit API | Ingest jobs free; use supervised browser/local autofill for applying. [Docs](https://developer.greenhouse.io/job-board.html) |
| Lever Postings API | Public postings | Apply endpoint is rate-limited and requires an API key | Ingest jobs free; do not claim universal direct submission. [Docs](https://github.com/lever/postings-api) |
| Ashby Job Postings API | Public job-board endpoint; compensation can be included | Public documentation is for postings, not universal candidate submission | Ingest canonical listings. [Docs](https://developers.ashbyhq.com/docs/public-job-posting-api) |
| USAJOBS | Search API with a free requested key | Government application flow varies | Add as an opt-in source for eligible users. [Docs](https://developer.usajobs.gov/api-reference/) |
| Remotive / Arbeitnow | Public feeds used by the current daily fetch | Redirect to source | Keep as supplementary sources after verifying display/commercial terms. |

Architecture rule: ingest once, normalize once, deduplicate once, then rank many users locally. A user refresh must not trigger a fresh web crawl plus a frontier-model search.

## Per-operation worst-case budget

These caps assume prompts are trimmed, structured JSON is used, and the router in `supabase/functions/_shared/llm.ts` is used instead of hardcoded `gpt-4o` calls.

| Operation | Model / infrastructure assumption | Budgeted worst-case |
| --- | --- | ---: |
| Job/resume fit evaluation | nano: 8k input + 800 output | $0.0026 |
| Resume parse/structure | mini: 8k input + 2k output | $0.0150 |
| Tailored resume | mini: 10k input + 3k output | $0.0210 |
| Cover letter + application answers | mini: 6k input + 2k output | $0.0135 |
| Complete tailored application packet | fit + tailoring + answers, with 20% retry reserve | $0.0445 |
| Cloud browser application | 5 minutes plus 20% retry reserve at $0.12/hour | $0.012 browser time |
| Managed proxy allowance | capped at 5 MB/application at $12/GB | about $0.06/application |
| Transactional email | 5 messages/application at $0.90/1k overage | $0.0045/application |
| Resume/PDF storage | 2 MB/application at Supabase storage/egress overage rates | less than $0.001/application before included quota |

The proxy allowance must be a hard byte budget, not an unlimited promise. Failed system runs should refund the user's application credit, but their retry consumption still counts internally toward a separate abuse/cost ceiling.

## Recommended launch plans

Do not advertise “unlimited.” Every paid plan needs a visible monthly meter and server-enforced hard cap.

### Free — $0

- 1 source resume
- public job browsing and tracker
- 10 fit evaluations/month
- 3 tailored application packets/month
- manual portal apply
- no managed cloud browser

### Pro — $39/month

- 100 fit evaluations/month
- 30 tailored application packets/month
- resume versions, ATS checks, answer memory, cover letters, interview preparation
- supervised portal workflow; no managed cloud submission allowance

Worst-case per account at 10 paid customers:

| Cost | Amount |
| --- | ---: |
| Stripe Payments + Billing | $1.70 |
| 30 complete packets | $1.34 |
| 100 fit evaluations | $0.26 |
| cached job-data/email/storage allowance | $0.55 |
| allocated Vercel + Supabase base at only 10 customers | $4.50 |
| **Total COGS** | **$8.35** |
| **Gross margin** | **78.6%** |

At 25+ paid customers the allocated base falls and the margin improves. The Pro plan does not include cloud auto-submit; keeping that workload in Autopilot protects the margin and makes the tiers understandable.

### Autopilot — $99/month

- everything in Pro
- 100 successful supported-portal submissions/month
- review-before-submit by default
- 500 MB managed proxy budget/month
- observable Prepared / Queued / Submitted / Failed / Skipped states
- failed system runs refund customer credits
- extra application packs are sold separately instead of silently exceeding the cap

Worst-case monthly account at 25 paid customers:

| Cost | Amount |
| --- | ---: |
| Stripe Payments + Billing on $99 | $3.86 |
| 100 complete application packets | $4.45 |
| browser time with retry reserve | $1.20 |
| 500 MB managed proxy allowance | $6.00 |
| email, job-data, and storage allowance | $1.50 |
| CAPTCHA/retry anomaly reserve | $2.00 |
| allocated $65 launch platform base at 25 customers | $2.60 |
| **Total COGS** | **$21.61** |
| **Gross margin** | **78.2%** |

At $99 the defined worst case is about 78.2% gross margin, leaving roughly 28 percentage points above the 50% floor for refunds, support, and vendor-price changes. Human application review is still outside this tier and should be a separate $199+ concierge offer or paid add-on.

## Current cost leaks to fix before billing

1. `job-search` can run several Exa searches with page content and then invoke Sonar Pro for one user request. At 100 searches this can consume roughly $8+ of Exa and roughly $6-$12+ of Sonar/token cost per account. Replace it with centralized cached ingestion and nano ranking.
2. Several older functions hardcode `gpt-4o`. Route extraction/classification to nano and tailoring to mini; reserve larger models for explicit fallback.
3. The landing page, in-app pricing page, Auto Apply gate, checkout function, and webhook currently disagree on price. Do not activate public checkout until one plan catalog drives all of them.
4. Auto-apply now has an entitlement check and a 120-execution infrastructure ceiling, but there is not yet a complete customer-facing monthly meter for fit evaluations, tailored packets, successful submissions, and managed proxy bytes. Marketing limits without full enforcement do not protect margin.
5. Stripe webhook signature verification is marked incomplete in the current function. Billing is not production-ready until signatures, idempotency, and plan entitlements are verified.

## Deployment decision

Keep:

- GitHub Actions for deterministic CI, optional nano advisory review, and environment-gated edge deployments
- Vercel for frontend previews/production
- separate Supabase dev and production projects
- dev branch -> preview -> browser QA -> reviewed promotion

Do not add now:

- Jenkins: duplicates GitHub Actions and needs a maintained runner/server
- Kubernetes: no current workload justifies its control plane, nodes, observability, or operator burden
- a second job-search LLM vendor in the hot path

Revisit containers/Kubernetes only when a measured always-on browser-worker workload is cheaper on a dedicated cluster than Browserbase/serverless and there is enough traffic and operational capacity to run it safely.
