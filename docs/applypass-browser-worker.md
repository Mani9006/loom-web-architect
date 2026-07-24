# ApplyPass Browser Worker

This worker consumes queued tasks from `applypass_tasks` and runs Playwright browser automation for job application flows.

The production shape mirrors the cloud-execution boundary used by mature
auto-apply products: the web UI only creates/cancels work, while this isolated
long-lived service claims tasks and streams status through the database. One
container runs four independent browser slots by default so several employers
can progress at the same time.

## What it does
- Claims pending tasks from `applypass-agent-queue`.
- Opens each queued job URL in a real browser context.
- Autofills common fields from candidate profile + answer memory.
- Optionally clicks submit (`APPLYPASS_AUTO_SUBMIT=true`).
- Writes progress heartbeats and final results back to queue.

## Adapters

The worker routes every job URL through a per-ATS adapter layer in
`scripts/ats-adapters/` (the same pattern mature auto-apply products use to
get portal-level reliability):

- `contract.mjs` — the adapter interface (`detect`, `prepare`, `fillFields`,
  `reviewState`, `findSubmitButton`, `submit`, `verifyReceipt`,
  `handleVerification`, `metadata`)
  plus the shared submit-refusal guard.
- `greenhouse.mjs` — Greenhouse boards (`boards.greenhouse.io`,
  `job-boards.greenhouse.io`, `*.greenhouse.io` embedded/iframe). Standard
  fields, resume upload, label-driven custom questions, the emailed
  security-code step (reusing the worker verification loop), and
  visible confirmation-container/application-ID receipt detection.
- `lever.mjs` — `jobs.lever.co` postings (`/apply` form, `name`/`email`/
  `phone`/`org`/`urls[...]` fields, custom cards, `/thanks` or
  `.confirmation` receipt detection).
- `generic.mjs` — conservative fallback autofill/submit detection for
  unsupported ATS pages.
- `index.mjs` — `pickAdapter(url, page)` tries Greenhouse, then Lever, then
  falls back to generic. Next per the capability matrix: Ashby.

Adapter policies (enforced in code, see `scripts/ats-adapters/adapters.test.mjs`):

- Custom questions are answered only on a strong fuzzy match against the
  user's answer memory; unmatched REQUIRED questions are reported as
  `requiredMissing` and the job is recorded `needs_attention` instead of
  guessing.
- Consent checkboxes are ticked only when answer memory contains an explicit
  affirmative for that question. Unknown consents are never auto-accepted.
- CAPTCHAs and login walls are never bypassed; detection routes the job to
  `needs_attention` with a reason.
- `submit()` refuses unless `APPLYPASS_AUTO_SUBMIT=true` AND a per-job
  approval receipt exists, and the worker re-checks the account's Continuous
  Apply authorization immediately before the final click.
- `verifyReceipt()` uses ATS-specific confirmation signals (a visible
  confirmation container/URL or application ID). Generic "thank you" text is
  never enough to report `submitted`.

Run the adapter unit tests (no browser needed):

```bash
node --test scripts/ats-adapters/adapters.test.mjs
```

## Required environment variables
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`
- `APPLYPASS_WORKER_TOKEN` (or the shared `WORKER_AUTH_TOKEN`)

## Optional environment variables
- `APPLYPASS_WORKER_ID` (default: `applypass-worker-<hostname>`)
- `APPLYPASS_WORKER_CONCURRENCY` (default: `4`, maximum: `12`)
- `APPLYPASS_WORKER_POLL_MS` (default: `5000`)
- `APPLYPASS_AUTO_SUBMIT` (`true` or `false`, default `false`)
- `APPLYPASS_SCREENSHOT_DIR` (DEV diagnostics only; also requires
  `APPLYPASS_RUNTIME_ENV=development` and
  `APPLYPASS_DEV_DIAGNOSTIC_SCREENSHOTS=true`)
- `APPLYPASS_MAX_TASKS` (process N tasks then exit)

## Local run
```bash
npm run applypass:worker
```

Single-run mode:
```bash
npm run applypass:worker:once
```

## Docker development runtime

```bash
cd infra/applypass-worker
cp .env.worker.example .env.worker
docker compose up --build
```

Keep `APPLYPASS_AUTO_SUBMIT=false` for QA. Turn it on only in an isolated
production worker after the account profile, answer memory, portal adapters,
and receipt tests have passed. The worker checks the account's current
Continuous Apply authorization immediately before every final submit, so the
Stop applying command cancels pending and in-flight work safely.

## n8n / Make integration
1. Run worker on your Mac mini as a long-running service.
2. Trigger worker restarts via n8n health checks.
3. Use queue table (`applypass_tasks`) as source of truth for status.
4. Scale browser slots horizontally; never move Playwright into Vercel request handlers.
4. Alerts: trigger when `status = failed` or stale `heartbeat_at`.

## Free dev runner

`.github/workflows/continuous-apply-worker-dev.yml` is a manual, bounded DEV
worker on GitHub-hosted runners. It uses only `DEV_*` secrets, processes one
task by default, and hard-codes `APPLYPASS_AUTO_SUBMIT=false`; this validates
queue throughput without sending QA data to employers. Logs and run status
are retained as a short-lived workflow artifact. Screenshots are retained only
when the operator explicitly enables the DEV diagnostic input.
Its queue credential is the dedicated `DEV_APPLYPASS_WORKER_TOKEN`, not the
general orchestrator token or the Gmail polling token. The workflow also
refuses to run unless `DEV_SUPABASE_URL` resolves to the expected DEV project,
so a misconfigured secret cannot point this QA worker at production.

The production workflow also defaults to dry-run. Scheduled production runs
cannot enable submission; a submit-enabled run must be started manually and
must be dispatched from `main` with the exact production confirmation phrase.
Configure protected-environment reviewers as an additional control when the
repository plan supports them.
Production artifacts use an explicit allowlist containing only the worker log
and run-status file; browser screenshots are disabled and excluded.

## Safety mode recommendation
- Keep `APPLYPASS_AUTO_SUBMIT=false` initially.
- Review safe logs (and, when explicitly enabled in DEV, diagnostic
  screenshots) before enabling auto-submit for trusted domains.
