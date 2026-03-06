# ApplyPass Browser Worker

This worker consumes queued tasks from `applypass_tasks` and runs Playwright browser automation for job application flows.

## What it does
- Claims pending tasks from `applypass-agent-queue`.
- Opens each queued job URL in a real browser context.
- Autofills common fields from candidate profile + answer memory.
- Optionally clicks submit (`APPLYPASS_AUTO_SUBMIT=true`).
- Writes progress heartbeats and final results back to queue.

## Required environment variables
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `APPLYPASS_WORKER_TOKEN`

## Optional environment variables
- `APPLYPASS_WORKER_ID` (default: `applypass-worker-<hostname>`)
- `APPLYPASS_WORKER_POLL_MS` (default: `5000`)
- `APPLYPASS_AUTO_SUBMIT` (`true` or `false`, default `false`)
- `APPLYPASS_SCREENSHOT_DIR` (save screenshots for each processed job)
- `APPLYPASS_MAX_TASKS` (process N tasks then exit)

## Local run
```bash
npm run applypass:worker
```

Single-run mode:
```bash
npm run applypass:worker:once
```

## n8n / Make integration
1. Run worker on your Mac mini as a long-running service.
2. Trigger worker restarts via n8n health checks.
3. Use queue table (`applypass_tasks`) as source of truth for status.
4. Alerts: trigger when `status = failed` or stale `heartbeat_at`.

## Safety mode recommendation
- Keep `APPLYPASS_AUTO_SUBMIT=false` initially.
- Review logs/screenshots and then enable auto-submit per trusted domains.
