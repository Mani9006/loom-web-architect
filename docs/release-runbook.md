# ResumePreps release and QA runbook

Infrastructure and cost decisions are documented in `docs/infrastructure-decision.md`.

## Environment contract

| Environment | Git branch | Frontend | Database/functions | Data policy |
|---|---|---|---|---|
| Local | feature branch | local Vite | local or dedicated development Supabase | synthetic only |
| Staging | `develop` | Vercel Preview deployment | staging Supabase project | synthetic QA users; no production email connections |
| Production | `main` | production domain | production Supabase project | real users plus two restricted smoke accounts |

The two Supabase projects must use different project references, service keys, database passwords, OAuth credentials, Stripe modes, email providers, and storage buckets. Never point a preview build at the production database.

## Promotion flow

1. Create a `codex/*` or normal feature branch from the latest `develop`.
2. Make schema changes backward-compatible: add columns first, deploy readers/writers, migrate data, and remove old fields only in a later release.
3. Open a pull request into `develop`.
4. Require type check, tests, build, high-severity dependency audit, and review.
5. Merge to `develop`; migrations and edge functions deploy to staging and Vercel deploys a Preview frontend.
6. Run the staging smoke matrix below.
7. Open a promotion pull request from `develop` into `main` with release notes and migration impact.
8. Require green staging evidence and review before merging to `main`.
9. From `main`, manually dispatch the production deployment and enter
   `DEPLOY_PRODUCTION_FROM_MAIN`; the same immutable commit is deployed.
10. Run restricted smoke tests and monitor errors, application failures, AI cost, and auth for at least one normal traffic window.

Do not develop directly on `main`. Do not cherry-pick untested fixes into
production; incident repair branches also target `develop`.

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

### Supabase Auth email hook

The `send-email` Edge Function accepts direct service calls and the Supabase
HTTP **Send Email** Auth Hook through different authentication paths. The Auth
Hook must use Supabase's generated Standard Webhooks signature; a custom static
header is not sufficient.

For each environment:

1. In Supabase, open **Authentication → Hooks → Send Email** and choose HTTPS.
2. Use that environment's `/functions/v1/send-email` URL.
3. Generate the hook secret in the Supabase dashboard.
4. Store the exact generated value as the Edge Function secret
   `SEND_EMAIL_HOOK_SECRET` (never in Vercel, GitHub source, logs, or a
   migration).
5. Deploy `send-email`, then verify signup confirmation, magic link, password
   reset, and email-change messages in that environment.
6. Confirm an unsigned request and a request with a modified body both return
   `401`.

The function intentionally fails closed when the signing secret or Standard
Webhooks headers are missing. Do not enable or promote the hook until the
secret and smoke tests are complete.

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
