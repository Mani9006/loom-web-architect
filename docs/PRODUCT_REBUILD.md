# ResumePreps product rebuild

Replaces every user-facing surface. Visual language is **Signal**: cool graphite + deep teal, IBM Plex Sans/Mono only. Not the rejected cream/serif marketing skin. Not the old indigo sidebar app.

US jobs only. Brand: ResumePreps.

## Pages — live vs stubbed

| Route | Status | Notes |
|---|---|---|
| `/` Landing | **Live** | Same design system as the app |
| `/how-it-works` | **Live** | Pipeline narrative |
| `/plans` | **Live** | Stripe checkout via `create-checkout` |
| `/faq` `/terms` `/privacy` | **Live** | Same system |
| `/auth` `/reset-password` | **Live** | Supabase email + Google |
| `/home` | **Live** | Filters, top matches Pass/Apply, batch apply of visible top set, applications table + tabs + pagination |
| `/matches` | **Live** | US feed, Save, details drawer, Add URL → `career-ops-one-click` |
| `/applications` | **Live** | Tabs All/Submitted/In flight/Needs you/Failed/Skipped |
| `/applications/:id` | **Live** | Queue stages, tailor motion, form receipt, resume before/after, cover empty state, job, apply-from + related inbox. Failed: download / skip / I've applied (does **not** fake submitted). Needs you stays Needs you |
| `/inbox` | **Live** | Dedicated apply-from address, categories, compose, Gmail connect (`mc-gmail-connect`). Outlook: complete UI, env required |
| `/pipeline` | **Live** | Sankey-ish counts, kanban, card modal, CSV import/export, add manual |
| `/hands-off` | **Live** | Enable (confirm required), daily cap, resume, filters, exclude-only, review-before-submit, min match, Off/Honest/Aggressive, cover auto, run history, recipes, AI tuner preview-then-save |
| `/resume` | **Live** | Multi-profile, templates, font/size/align/fit one page/reorder, cover, US work auth (F-1/H-1B/citizen), ATS defaults via ApplicationProfileCard + `parse-document` |
| `/people` | **Live** | Networking lite CRUD (`network_people`, local fallback) |
| `/notes` | **Live** | Research lite CRUD (`research_notes`, local fallback) |
| `/settings` | **Live** | Apply settings, memory, Workday vault UI, Indeed/Naukri connect UI (no fake submit), plans/credits, referrals stub, email, sign out |
| Assistant slide-out | **Live** | Tools + guardrails; `ops-assistant` with local fallback if the model is down |
| `/admin` `/control-center` | **Live (owner)** | Unchanged ops consoles |

Stubbed (honest UI, no fake success):

- Outlook / Indeed / Naukri **OAuth handshake** until env vars exist
- Workday **password persist** until `WORKDAY_VAULT_KEY`
- Referral credit issuance
- Workday / Jobvite **auto-submit** — detected, forced to Needs you

## Engine reused

- Supabase Auth
- Career-Ops: `career-ops-bootstrap`, `evaluate`, `tailor`, `ats`, `submit`, `one-click`, `career-agent-control`, `career-profile-review`, `career-ops-tailor-report`
- Worker: `applypass-agent-queue` + `scripts/ats-adapters` (Greenhouse, Lever, Ashby, Workable)
- Resume parse: `parse-document`
- Gmail: `mc-gmail-*`
- Billing: `create-checkout`, `stripe-webhook`

## Credits

`credit_balances` + `credit_ledger`. RPC `consume_application_credit` runs only when the worker records `submitted === true`. Idempotent on `draft_application_id`. Failures after a prior submit refund.

## Env vars

See `.env.example`. Client needs `VITE_SUPABASE_*`. Edge/worker secrets listed there (Gmail, Outlook, Stripe, worker token, Workday vault, Indeed/Naukri, Resend).
