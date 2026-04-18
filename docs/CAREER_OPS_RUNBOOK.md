# Career-Ops Pipeline — Deploy Runbook

## Agents update (April 2026)

Latest PR adds the agent layer: LinkedIn optimizer, real ATS scoring,
story bank, and tiered model routing. All new functions share a single
AI client and a single guards helper to keep behavior consistent.

### Model routing policy

| Tier                    | Model                          | Used by                                             |
|-------------------------|--------------------------------|-----------------------------------------------------|
| `simple`                | `claude-haiku-4-5-20251001`    | career-ops-ats keyword extract, connection notes    |
| `complex` / `research`  | `claude-sonnet-4-6`            | evaluate, tailor, linkedin-{headline,about,post}, story-bank |
| `opus-4-7-auto-apply`   | `claude-opus-4-7`              | RESERVED — only auto-apply form-filling is allowed to use Opus. |

Every call uses prompt caching on the system prompt + (optional) cached
context (e.g. the user's résumé). ~85% cache hit rate at normal usage
→ ~6× cost reduction vs uncached.

### New edge functions

- **`career-ops-linkedin`** — headline / about / post / connection_note
  optimizer, grounded in the user's latest résumé. Writes to
  `linkedin_optimizations`.
- **`career-ops-ats`** — real ATS scoring. Deterministic format / bullet
  analysis + Haiku 4.5 keyword extraction from a JD. Six dimensions 0-100,
  weighted overall score. Writes to `ats_scores`.
- **`career-ops-story-bank`** — STAR+R story extractor. Reads résumé +
  recent evaluations, produces 5-7 reusable behavioural answers. Writes to
  `interview_stories`.

### New tables (migration `20260420100000_career_ops_agents.sql`)

- `linkedin_optimizations` — history of LinkedIn AI outputs
- `ats_scores` — dimensional ATS scoring results
- `interview_stories` — STAR+R stories (user-editable)
- `company_research` — cached deep research per company/role
- `application_followups` — follow-up email drafts per application

All with RLS bound to `auth.uid()`. Writes to `linkedin_optimizations`
and `ats_scores` are service-role-only to keep scores honest.

### Daily caps (per user, per kind)

| Kind          | Free | Pro |
|---------------|------|-----|
| evaluation    | 20   | 200 |
| tailor        | 10   | 100 |
| linkedin      | 10   | 100 |
| ats           | 25   | 500 |
| story         | 15   | 150 |

### Deploy sequence (this release)

```bash
# Migrations (new tables + widen ai_usage_daily kind check)
supabase db push

# Deploy edge functions (old + new)
supabase functions deploy career-ops-scan
supabase functions deploy career-ops-evaluate
supabase functions deploy career-ops-tailor
supabase functions deploy career-ops-submit
supabase functions deploy career-ops-linkedin
supabase functions deploy career-ops-ats
supabase functions deploy career-ops-story-bank
```

No new secrets needed — all edge functions use the existing
`ANTHROPIC_API_KEY`.

---



## Why the site showed "no changes" after merging PR #30

The code shipped, but the **feature is dormant** until the Supabase-side
steps below are done. The editorial redesign (cream canvas, Source Serif 4,
circled R logo) applies immediately on any Vercel rebuild; but the `/matches`
page will be empty because no jobs have been scanned yet.

If the editorial design itself didn't appear, it's one of:

1. **Vercel didn't redeploy** — check the Deployments tab in Vercel and
   confirm the latest commit on `main` built successfully.
2. **Browser / CDN cache** — hard reload (Shift+Cmd+R). Vercel's CDN
   usually purges on deploy but occasionally stale HTML lingers.
3. **Vercel is pointing at a different branch** — check Project Settings →
   Git → Production Branch. It must be `main`.

## Phase 1 + 2 activation (do this once after merging)

### 1. Run the migration

```bash
supabase db push
# or, if you're on the hosted project:
supabase migration up --linked
```

This creates:
- `scan_companies`, `scanned_jobs`, `user_job_prefs`, `job_evaluations`,
  `ai_usage_daily`, `draft_applications` tables
- `increment_ai_usage()` SECURITY DEFINER function
- RLS policies (every table; tied to `auth.uid()`)
- `pg_cron` + `pg_trgm` extensions
- 20 seed companies

### 2. Set function secrets

```bash
# These should already exist from the `chat` function — confirm:
supabase secrets list --linked
# Required keys:
#   ANTHROPIC_API_KEY   (Claude Sonnet 4.5 access)

# If missing:
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Deploy edge functions

```bash
supabase functions deploy career-ops-scan
supabase functions deploy career-ops-evaluate
supabase functions deploy career-ops-tailor
supabase functions deploy career-ops-submit
```

### 4. Set pg_cron GUCs (for hourly auto-scan)

Run once in the SQL editor:

```sql
ALTER DATABASE postgres SET "app.settings.career_ops_scan_url" =
  'https://<project-ref>.supabase.co/functions/v1/career-ops-scan';
ALTER DATABASE postgres SET "app.settings.service_role_key" =
  '<service-role-key>';
```

Replace `<project-ref>` and `<service-role-key>` with your actual values.
Until these are set, the cron job registered at migration time is a no-op.

### 5. Seed: trigger the first scan manually

```bash
curl -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source":"manual"}' \
  https://<project-ref>.supabase.co/functions/v1/career-ops-scan
```

Expected response (truncated):

```json
{
  "scanned": 20,
  "results": [
    {"company":"anthropic","upserted":47},
    {"company":"openai","upserted":63},
    ...
  ],
  "marked_stale": 0
}
```

If you see 500s per company, check the edge-function logs — typically
either a network error or a company whose `api_identifier` is stale.

### 6. Smoke-test end-to-end

1. Sign in as a test user.
2. Navigate to **/matches** — you should see scanned jobs.
3. Click **Score** on any row — runs `career-ops-evaluate`. Takes ~4-8s.
4. Once scored, click **Prepare** — runs `career-ops-tailor`, opens the
   **/applications/:id** review screen with the tailored CV + answers.
5. From the review screen, **Open portal →** takes them to the employer's
   application page. **I submitted it** marks it done.

## Phase 3 activation: auto-submit (Greenhouse only)

The scan → evaluate → tailor chain is safe to enable for everyone. Auto-submit
is **off by default** per user and requires explicit opt-in.

### Per-user enablement

Users flip the switch themselves at **/career-ops/preferences**. The page
writes to `user_job_prefs.auto_apply_enabled`.

### Worker-side wiring (one-time)

The existing `applypass_tasks` queue handles submission asynchronously. The
`career-ops-submit` edge function enqueues tasks with `task_type =
'career_ops_submit'`; the existing worker (`applypass-browser-session`) needs
a handler for this task type.

**TODO for the worker team:** extend the worker to recognize
`task_type = 'career_ops_submit'`. The payload shape is:

```ts
{
  portal: "greenhouse",
  company_slug: string,
  company_name: string,
  api_identifier: string,  // the Greenhouse board slug
  job_external_id: string, // the Greenhouse job id
  job_title: string,
  apply_url: string,
  draft_application_id: uuid,
  tailored_resume_id: uuid,
  evaluation_id: uuid,
  answers: Array<{ question: string; answer: string }>,
}
```

The worker should:
1. Load the tailored resume (JSONB) from `resumes` by `tailored_resume_id`,
   render it to PDF (reuse existing Playwright generator at
   `supabase/functions/parse-document/` or the client-side PDF path).
2. Fetch the Greenhouse question schema:
   `GET https://boards-api.greenhouse.io/v1/boards/{api_identifier}/jobs/{job_external_id}?questions=true`
3. Map answers JSON → Greenhouse question ids.
4. POST to `https://boards-api.greenhouse.io/v1/boards/{api_identifier}/jobs/{job_external_id}/applications`
   with multipart/form-data.
5. On success, `UPDATE draft_applications SET status='submitted', submitted_at=now()`
   and log success in `applypass_tasks.result`.
6. On failure, `UPDATE draft_applications SET status='failed', error_message=...`
   and surface to the user.

### Guardrails (already enforced by `career-ops-submit`)

- User must set `auto_apply_enabled = true`
- Draft must be `status = 'ready'` (prepared but not yet submitted)
- Portal must be Greenhouse (other portals return 422)
- Daily cap (`user_job_prefs.daily_apply_cap`, default 5) enforced at enqueue

### Intentionally not supported

- **Ashby** — API requires per-org key. Out of scope.
- **Lever** — OAuth flow; out of scope.
- **Workday / Oracle Taleo** — bespoke per-tenant pages. Out of scope.
- **LinkedIn Easy Apply** — explicitly against LinkedIn ToS; automation
  leads to account termination. Never auto-submit.

## Cost estimates (10,000 active users)

| Event | Rate | Model | Input tokens | Output tokens | Cost/call | Daily cost |
|-------|------|-------|--------------|---------------|-----------|------------|
| Scan  | hourly | — | — | — | $0 | $0 (zero-LLM) |
| Evaluate | 20/user/day | Sonnet 4.5 cached | ~3.5K | ~700 | ~$0.012 | $2,400 |
| Tailor  | 5/user/day | Sonnet 4.5 cached | ~4K | ~1.5K | ~$0.021 | $1,050 |
| **Total** | | | | | | **~$3,500/day** |

**Controls already in place:**
- Free-tier caps: 20 evaluations/day, 10 tailors/day → ~$0.33/user/day at full use
- Pro-tier caps: 200 / 100 → ~$3.30/user/day
- Prompt caching: ~85% hit rate on system prompt + resume = ~$0.001/call
- Daily-cap enforcement happens BEFORE the Claude call (usage row
  checked; never charged if cap already hit)

## Admin diagnostics

```sql
-- Companies with errors
SELECT slug, last_scanned_at, last_scan_error FROM scan_companies
WHERE last_scan_error IS NOT NULL ORDER BY last_scanned_at DESC;

-- Live job count per company
SELECT c.slug, count(*) live_jobs
FROM scanned_jobs j JOIN scan_companies c ON c.id=j.company_id
WHERE j.is_live GROUP BY c.slug ORDER BY live_jobs DESC;

-- Heaviest AI users today
SELECT user_id, sum(count) calls, sum(tokens_in+tokens_out) tokens
FROM ai_usage_daily WHERE day=CURRENT_DATE
GROUP BY user_id ORDER BY calls DESC LIMIT 10;

-- Pending auto-submits
SELECT id, user_id, created_at, status, error_message
FROM applypass_tasks WHERE task_type='career_ops_submit'
AND status IN ('pending','running') ORDER BY created_at;
```

## Rollback

If auto-submit misbehaves in production, kill-switch is one row:

```sql
UPDATE user_job_prefs SET auto_apply_enabled = false;
-- or per-user:
UPDATE user_job_prefs SET auto_apply_enabled = false WHERE user_id = '...';
```

Edge functions can be rolled back individually:

```bash
supabase functions delete career-ops-submit
# evaluate/tailor/scan remain safe without submit
```
