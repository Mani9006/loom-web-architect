# 2. Run production schedules and the apply worker outside CI

Date: 2026-10-01

## Status

Proposed

## Context

Production background work runs as GitHub Actions scheduled workflows:

- `prod-backend-crons.yml`: every 15 minutes it calls `mc-gmail-poll` and
  `agents-orchestrator`; hourly it calls `career-ops-scan`.
- `continuous-apply-worker.yml`: every 15 minutes it starts the Playwright
  browser worker (`scripts/applypass-browser-worker.mjs`, `--max-tasks=10`).

These moved to Actions because the existing pg_cron jobs read their target URL
and service key from `app.settings.*` database settings, which only a dashboard
superuser can set.

Since 2026-09-21, GitHub Actions has failed at startup for every workflow
because of an account-level billing/limit problem. Production stopped with no
alert: no inbox polling, no orchestrator ticks, no job scans and no
applications. CI capacity, a developer-tooling budget, had become a production
dependency. Actions cron is also best-effort: runs are delayed under load,
disabled after 60 days without repository activity, and limited by job time
caps that cut off a long-running browser worker.

Supabase already provides `pg_cron` and `pg_net`, which several migrations use,
and Supabase Vault for secrets that SQL can read. The worker already talks to
the system only over HTTP (`applypass-agent-queue`) and recovers from restarts
through the queue reaper, so it can run on any host.

## Decision

1. **Schedules run in the database.** Production and staging schedules use
   `pg_cron` + `net.http_post`. The function base URL and a dedicated worker
   token come from `vault.decrypted_secrets`, not `app.settings.*`. Each job
   is defined in a migration, so schedules are versioned and reviewed.
2. **The browser worker runs on an always-on container host** (Fly.io,
   Railway or Render), built from `infra/applypass-worker/Dockerfile`, with
   the same environment variables it uses today. Moving browser execution to
   Browserbase sessions remains an option under the same queue contract.
3. **GitHub Actions is for CI/CD only:** quality gates, deploys and manual
   `workflow_dispatch` runbooks. Scheduled workflows that touch production
   lose their `schedule:` trigger once the replacement is verified.
4. **Liveness is monitored from outside the scheduler.** A pg_cron watchdog
   alerts when `agent_runs` / `applypass_tasks` show no progress for an hour,
   and the worker host's health check restarts a stuck worker.

## Consequences

- An Actions outage or billing problem no longer stops production. A Supabase
  outage still does, but then the app is down too and that is already
  visible.
- One new vendor (the container host) and its cost, about one small
  always-on machine. Chromium needs about 1 to 2 GB of RAM per concurrent
  slot.
- Schedules become database objects. Changing one needs a migration, and
  `cron.job` / `cron.job_run_details` become the place to look for history.
- The worker token used by pg_cron must be rotated through Vault. It must not
  be the service-role key.
- Rollout order: (1) Vault secrets plus a pg_cron migration on staging,
  verified with `cron.job_run_details`; (2) the same on production; (3)
  remove the `schedule:` triggers from the workflows; (4) deploy the worker
  container, confirm it drains `applypass_tasks`, then remove the worker
  workflow's schedule.
