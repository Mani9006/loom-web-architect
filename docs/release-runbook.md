# ResumePreps release and QA runbook

Infrastructure and cost decisions are documented in `docs/infrastructure-decision.md`.

## Environment contract

| Environment | Git branch | Frontend | Database/functions | Data policy |
|---|---|---|---|---|
| Local | feature branch | local Vite | local or dedicated development Supabase | synthetic only |
| Staging | `main` | Vercel staging project/domain | staging Supabase project | synthetic QA users; no production email connections |
| Production | `production` | production domain | production Supabase project | real users plus two restricted smoke accounts |

The two Supabase projects must use different project references, service keys, database passwords, OAuth credentials, Stripe modes, email providers, and storage buckets. Never point a preview build at the production database.

## Promotion flow

1. Create a `codex/*` or normal feature branch from the latest `main`.
2. Make schema changes backward-compatible: add columns first, deploy readers/writers, migrate data, and remove old fields only in a later release.
3. Open a pull request into `main`.
4. Require type check, tests, build, high-severity dependency audit, and review.
5. Merge to `main`; migrations and edge functions deploy to staging and Vercel deploys the staging frontend.
6. Run the staging smoke matrix below.
7. Open a promotion pull request from `main` into `production` with release notes and migration impact.
8. Require a human production approval and green staging evidence.
9. Merge to `production`; the same immutable commit is deployed to production.
10. Run restricted smoke tests and monitor errors, application failures, AI cost, and auth for at least one normal traffic window.

Do not develop directly on `production`. Do not cherry-pick untested fixes into production except through an incident branch that is also merged back to `main`.

## Required GitHub environments and secrets

Staging:

- `STAGING_SUPABASE_URL`
- `STAGING_SUPABASE_ANON_KEY`
- `STAGING_SUPABASE_PROJECT_REF`
- `SUPABASE_PROJECT_REF_STAGING`
- `SUPABASE_DB_PASSWORD_STAGING`
- `SUPABASE_ACCESS_TOKEN`

Production:

- `SUPABASE_PROJECT_REF_PROD`
- `SUPABASE_DB_PASSWORD_PROD`
- `SUPABASE_ACCESS_TOKEN`

Set environment protection on `production` with required reviewers. Store runtime model/API keys in the corresponding Supabase project secrets, not GitHub build variables or the repository.

## QA accounts

Passwords are generated on each run and printed once. Save them in a team password manager. The script refuses production unless an explicit opt-in is present.

Staging:

```bash
SEED_ENVIRONMENT=staging \
SUPABASE_URL=https://STAGING_REF.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=SECRET \
node scripts/seed-test-users.mjs
```

This creates free, pro, Autopilot, and admin QA personas.

Production:

```bash
SEED_ENVIRONMENT=production \
ALLOW_PRODUCTION_TEST_USERS=true \
SUPABASE_URL=https://PRODUCTION_REF.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=SECRET \
node scripts/seed-test-users.mjs
```

Production creates only restricted free and pro smoke personas; no seeded admin account.

## Staging smoke matrix

- new free user signup, verification, onboarding, and logout/login;
- profile load/save including phone and location;
- resume PDF and DOCX upload, parse, edit, render, download, and text extraction;
- career profile experience calculation with overlapping roles;
- preference save for country, level, work mode, sponsorship, compensation, and exclusions;
- clearly eligible role receives a high score with evidence;
- director/VP, wrong-country, no-sponsorship, and disallowed work-mode fixtures are blocked;
- blocked evaluation cannot be tailored through UI or direct function request;
- eligible evaluation produces a grounded tailored resume and review draft;
- supported ATS adapter fills a fixture form, pauses for review, submits only after an approval receipt, and records a verified confirmation;
- email classification fixture updates the tracker without exposing OTP content in logs;
- free/pro quotas and billing gates;
- admin authorization and audit log;
- mobile navigation and keyboard accessibility for the golden path.

## Rollback

Frontend and function regressions: revert the merge commit, let the branch deployment redeploy, and verify the previous release.

Database changes: prefer a forward fix. Additive migrations in this release are safe for older code. Do not automatically drop columns or rewrite production data during rollback. Any destructive rollback requires a backup, an exact row-count plan, and explicit approval.

If an application adapter submits incorrectly, disable that adapter/feature flag immediately, stop workers, preserve receipts and logs, and notify affected users with the exact scope.
