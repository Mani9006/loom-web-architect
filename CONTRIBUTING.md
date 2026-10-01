# Contributing to ResumePreps

Thank you for helping improve ResumePreps. This project values focused changes, clear validation, and safe handling of user data. These rules apply to humans and to automated agents (Claude Code, scheduled agents) alike.

## Before you start

- Check existing issues, `docs/architecture.md`, `docs/adr/`, and runbooks for related context.
- Keep each change scoped to one user-facing or operational outcome.
- Avoid unrelated rewrites, broad formatting-only changes, or speculative refactors.

## Local setup

```sh
npm ci
cp .env.example .env.local   # fill in the staging project's public values
npm run dev
```

`.env.example` lists every frontend `VITE_*` variable. Those values ship in the public bundle, so never put secrets there. Server-side secrets are Supabase secrets (`supabase secrets set NAME=...`). Every variable the code reads is listed in `docs/env-inventory.md`. Regenerate it with `npm run env:inventory` when you add or remove one; CI fails if it is stale.

## Branches

| Prefix | Use |
|---|---|
| `feat/<short-name>` | New user-facing capability |
| `fix/<short-name>` | Bug fix |
| `claude/<short-name>` | Branches created by Claude Code / remote agents |

Add the Jira key when there is one, for example `fix/KAN-42-resume-upload`. Do not commit directly to `main` or `production`. `main` deploys to staging, and `production` is promoted from `main` (see `docs/release-runbook.md`).

## Pull requests

- **One PR per change.** A PR should be reviewable in one sitting. Split refactors from behavior changes.
- **Squash merge.** The PR title becomes the commit on `main`, so write it as a commit subject (`[KAN-XX] description` when there is a ticket).
- **Head branches are deleted on merge.** Repository owner: enable *Settings → General → Pull Requests → "Automatically delete head branches"*, and under "Allow merge types" leave only *squash merging* enabled.
- Checklist for the description:
  - The user or business outcome.
  - A high-level summary of the implementation.
  - Screenshots or recordings for UI changes.
  - The validation you ran and any known limitations.
  - Migrations, secrets, feature flags or rollout steps the change needs.
  - The ADR it relies on, for structural changes (`docs/adr/`, format in ADR 0001).

### Scheduled and automated agents

Agents that run on a schedule (daily audits, dependency bumps, report generators) must **reuse a single tracking issue or PR**. They must not open a new one each run:

- Keep one long-lived branch per agent (for example `claude/nightly-audit`), force-update it, and update the existing open PR. Search for it by branch or label before creating one.
- When there is nothing to change, comment on the tracking issue (or do nothing). Do not open an empty PR.
- Close stale agent PRs instead of leaving them open beside a newer one.

## Quality gates

Run these before every commit. CI (`.github/workflows/quality-gate.yml`) runs the same checks:

```sh
npm run type-check        # zero errors
npm run test              # vitest, all passing
npm run lint              # zero errors (warnings are tolerated)
npm run build             # production build succeeds
npm run env:check         # docs/env-inventory.md and .env.example are current
# or everything at once:
npm run hq:gate
```

When you touch these areas, also run:

```sh
npm run test:adapters                     # browser worker ATS adapters (scripts/ats-adapters)
bash scripts/check-edge-functions.sh fn   # deno check for edge function(s) you touched
```

Edge functions currently carry type debt, so the CI `edge-functions` job does not block merges. A PR must not increase a function's `deno check` error count.

### Model IDs

Do not hard-code LLM model IDs in edge functions. Ask for a tier (`fast`, `balanced`, `deep`, `search`) through `supabase/functions/_shared/models.ts` (or through `callLlm` / `callClaude`, which use it). `src/test/model-literals.test.ts` fails if the count of hard-coded IDs rises above its baseline. When you migrate call sites, lower the baseline.

## Database changes

- Add a new migration in `supabase/migrations/`. Never edit one that has already been applied.
- Every new table gets RLS policies in the same migration.
- **After every migration, regenerate the TypeScript types** and commit them in the same PR:

  ```sh
  supabase gen types typescript --project-id <project-ref> > src/integrations/supabase/types.ts
  # or, against a local stack:
  supabase gen types typescript --local > src/integrations/supabase/types.ts
  ```

  Use the staging project ref (`VITE_SUPABASE_PROJECT_ID`). Stale types are the main source of `type-check` failures after schema changes.
- Production schedules belong in pg_cron migrations, not GitHub Actions (ADR 0002).

## Coding standards

- Prefer existing components, hooks, utilities, and Supabase patterns.
- Keep UI accessible, responsive, and consistent with shadcn/ui conventions.
- Do not expose service-role keys or server-only credentials in client code.
- In edge functions, read configuration with `requireEnv` / `optionalEnv` from `_shared/env.ts`.
- Add or update tests when changing business logic or critical workflows.
