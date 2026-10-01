# ResumePreps architecture

One page: what runs where, how an application flows through the system, and the
ordered path to scale it. Decisions live in [`docs/adr/`](adr/). Last reviewed
2026-10-01.

## System map

```
                         ┌──────────────────────────────────────────┐
  Browser (React SPA) ──►│ Vercel  — static Vite build, SPA routing │
          │              └──────────────────────────────────────────┘
          │ supabase-js (anon/publishable key + user JWT, RLS)
          ▼
┌──────────────────────────────── Supabase project (per environment) ────────────────────────────────┐
│  Auth ── Postgres (RLS) ── Storage                                                                  │
│            │  tables: profiles, resumes, scanned_jobs, job_evaluations, draft_applications,        │
│            │          applypass_tasks, tracked_jobs, mc_tracked_jobs, agent_runs, usage ...         │
│            │  pg_cron + pg_net (partly wired, see "Scaling path" a)                                 │
│            ▼                                                                                        │
│  Edge Functions (Deno, ~44)                                                                         │
│    user-facing:  job-search, resume-chat, chat, career-ops-tailor, career-ops-ats, parse-document  │
│    pipeline:     agents-orchestrator → agents-job-hunter → career-ops-{bootstrap,evaluate,tailor,  │
│                  ats,submit} ; career-ops-scan ; applypass-agent-queue (worker API)                 │
│    signals:      mc-gmail-poll / -connect / -callback ; stripe-webhook ; send-email                 │
│    shared:       _shared/{llm,ai,models,env,guards,jobs,...}.ts                                     │
└──────────┬────────────────────────────────────────────▲───────────────────────────────────────────┘
           │ HTTPS: OpenAI, Anthropic, Gemini, Perplexity,│ claim / heartbeat / complete
           │ Exa, Apify, Adzuna, Stripe, Gmail, Resend    │ (WORKER token, applypass-agent-queue)
           ▼                                              │
     External APIs                       ┌────────────────┴────────────────────────────┐
                                         │ ApplyPass browser worker (Node + patchright)│
                                         │ scripts/applypass-browser-worker.mjs        │
                                         │ + scripts/ats-adapters/* — TODAY runs as a  │
                                         │ GitHub Actions job every 15 min             │
                                         └─────────────────────────────────────────────┘
                                         applypass-browser-session ──► Browserbase (live
                                         cloud browser sessions for the in-app view)

  GitHub Actions: quality gate, edge-function deploys, AND (today) production schedules:
    prod-backend-crons.yml       */15  mc-gmail-poll, agents-orchestrator ; hourly career-ops-scan
    continuous-apply-worker.yml  */15  browser worker, --max-tasks=10
    career-ops-schedule.yml      hourly staging scan + orchestrator
```

## Where each component runs

| Component | Runs on | Deployed by | State |
|---|---|---|---|
| Frontend SPA | Vercel | Vercel Git integration (`main` → staging, `production` → prod) | none |
| Auth, Postgres, Storage | Supabase (one project per environment) | migrations in `supabase/migrations/` | all durable state |
| Edge functions | Supabase Edge Runtime (Deno 2) | `deploy-edge-functions.yml` | stateless; secrets via `supabase secrets` |
| Production schedules | **GitHub Actions cron** (to move, ADR 0002) | workflow files | none |
| Browser apply worker | **GitHub Actions runner** (to move, ADR 0002) | `continuous-apply-worker.yml` | stateless; queue in `applypass_tasks` |
| Live browser sessions | Browserbase | `applypass-browser-session` function | Browserbase session ids |
| LLMs | OpenAI (default), Anthropic, Gemini/Groq/OpenRouter (free chain), Perplexity (search) | `_shared/llm.ts` + `_shared/models.ts` | usage rows via `_shared/guards.ts` |

## Apply pipeline (data flow)

```
 [schedule] ─► agents-orchestrator ─(per eligible user)─► agents-job-hunter
                    │                                         │
                    └─► career-ops-scan ─► scanned_jobs        ├─► career-ops-bootstrap   (profile, prefs)
                                                              ├─► career-ops-evaluate    ─► job_evaluations (fit score)
                                                              ├─► career-ops-tailor      (LLM, critic loop)
                                                              ├─► career-ops-ats         (deterministic ATS check)
                                                              └─► career-ops-submit      ─► draft_applications
                                                                                         ─► applypass_tasks (pending)
 [worker every 15 min] browser worker ─ claim-next ─► applypass-agent-queue ─► applypass_tasks (running)
       │  pickAdapter(url) → greenhouse | lever | ashby | workable | generic
       │  fill → review → submit (only with AUTO_SUBMIT + per-job approval) → verifyReceipt
       └─ heartbeat / complete / fail ─► applypass_tasks ; queue reaper (pg_cron) re-queues stale tasks
 [signals] mc-gmail-poll ─► OTP inbox (verification codes for the worker) + reply classification
```

## Environments

| | Development | Staging | Production |
|---|---|---|---|
| Branch | feature branches (`claude/*`, `feat/*`, `fix/*`) | `main` | `production` |
| Frontend | `npm run dev` / Vercel preview | Vercel staging | Vercel production domain |
| Supabase | staging project (never prod) | staging project | production project |
| Schedules | none | `career-ops-schedule.yml` | `prod-backend-crons.yml`, `continuous-apply-worker.yml` |

Details: [`release-runbook.md`](release-runbook.md). Every variable and where it is
read: [`env-inventory.md`](env-inventory.md).

## Scaling path

Ordered; each step is independently shippable and leaves the system working.

**Why this order.** On 2026-09-21 GitHub Actions stopped starting jobs at the
account level (billing/limit). Every workflow failed at startup, and because
production schedules and the apply worker *are* workflows, production silently
stopped: no Gmail polling, no orchestrator ticks, no job scans, no applications.
Lesson: **production schedules must not depend on CI minutes**, and silence must
page someone.

**(a) Move production schedules and the worker off CI** ([ADR 0002](adr/0002-production-schedules-off-ci.md)).
1. Store the function base URL and a dedicated worker token in **Supabase Vault**
   (`vault.create_secret`) instead of the `app.settings.*` GUCs that blocked the
   existing pg_cron jobs (`20260422000000_agent_runs.sql`,
   `20260720030000_otp_inbox.sql`, `20260418120000_career_ops_pipeline.sql`
   already use `cron.schedule` + `net.http_post`).
2. One migration (re)schedules `mc-gmail-poll` and `agents-orchestrator` (*/15)
   and `career-ops-scan` (hourly) with `net.http_post`, reading the URL/token
   from `vault.decrypted_secrets`. Then disable the `schedule:` triggers in
   `prod-backend-crons.yml` (keep `workflow_dispatch` for manual runs).
3. Run the browser worker as an **always-on container** (Fly.io / Railway /
   Render machine using `infra/applypass-worker`), or move per-task execution
   to Browserbase sessions. The worker already claims via HTTP and survives
   restarts (queue reaper), so this is a hosting change only.
4. Add a heartbeat check: a pg_cron job that alerts (email via `send-email`)
   when `agent_runs`/`applypass_tasks` show no progress for 1 hour.

**(b) Queues: pgmq with idempotent workers and a DLQ.** Replace the
orchestrator → job-hunter HTTP fan-out with pgmq queues `scout`, `match`,
`tailor`, `apply`, `dlq`. pg_cron drains each queue by invoking a worker
function; each message is keyed on `(user_id, job_id, step)` so redelivery is
a no-op, archived only after its state change commits, and moved to `dlq`
after N reads (`read_ct`). One message = one bounded step, which fits edge
function CPU/wall-clock limits.

**(c) Model registry migration.** `_shared/models.ts` maps tiers
(`fast`/`balanced`/`deep`/`search`) to models via `MODEL_*` env; `llm.ts` and
`ai.ts` already resolve through it. Next: migrate the remaining hard-coded
call sites (ratchet in `src/test/model-literals.test.ts`, baseline 52 — lower
it with each PR), then back the registry with a `model_routes` table so routes
change without a deploy, and retire Haiku 4.5 before its earliest retirement
date (2026-10-15).

**(d) Observability.** Extend `agent_runs` and add `agent_steps` (run id,
skill + version, model, tokens in/out, cache read/write, cost, latency,
outcome). Every `callLlm` writes a step. Dashboards: cost per submitted
application, G1/G2 rejection rate, queue depth and DLQ size, worker success
rate per ATS adapter.

**(e) Unify job tracking.** Job state lives in three systems: `tracked_jobs`,
`mc_tracked_jobs`, and `draft_applications`/`applypass_tasks`. Migrate to one
applications table with a state enum (`discovered → scored → … → submitted →
closed`, plus `failed_retryable`/`needs_human`) and an append-only
`application_events` log written by a security-definer RPC; keep views or
redirects for old routes during the transition.
