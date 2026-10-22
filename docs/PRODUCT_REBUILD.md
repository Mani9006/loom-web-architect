# ResumePreps product rebuild

Visual language is **Nocturne Electrum**: near-black canvas, ivory type, one electrum accent, Instrument Sans + DM Mono. Not Tsenta. Not old indigo ResumePreps. Not cream/serif. Not the rejected graphite/teal IBM Plex skin.

US jobs only. Brand: ResumePreps. This is a company desk, not a solo admin toggle.

## Pages — live vs stubbed

| Route | Status | Notes |
|---|---|---|
| `/` Landing | **Live** | Same night canvas as the app |
| `/how-it-works` `/plans` `/faq` `/terms` `/privacy` `/status` | **Live** | Marketing + public health |
| `/auth` `/reset-password` `/invite/:token` | **Live** | Supabase email + Google; company invite accept |
| `/home` | **Live** | Filters, top matches Pass/Apply, applications table, Stripe `?checkout=success` |
| `/matches` | **Live** | US feed, Save, details, Add URL |
| `/applications` `/applications/:id` | **Live** | Tabs + tailor motion. Submitted never without a worker receipt |
| `/inbox` `/pipeline` `/apply` `/hands-off` | **Live** | Inbox, kanban, hands-off confirm |
| `/resume` `/people` `/notes` `/settings` | **Live** | Resume profiles, networking, research, vaults |
| `/admin` `/admin/team` | **Live** | Company org, seats, roles, invites |
| `/admin/users` `/admin/errors` `/admin/health` `/admin/codes` `/admin/flags` `/admin/audit` | **Live** | Privileged ops, all audited |

Stubbed (honest UI, no fake success):

- Outlook / Indeed / Naukri OAuth until env vars exist
- Workday password persist until `WORKDAY_VAULT_KEY`
- Workday / Jobvite auto-submit — detected, forced to Needs you

## Company roles

`OWNER_EMAIL` / `ADMIN_OWNER_EMAILS` / `VITE_ADMIN_OWNER_EMAILS` seeds the first Owner (`myfamily9006@gmail.com` by default). They invite the rest from `/admin/team`.

| Role | Billing | Support | Impersonate | Promo codes | Worker replay | Flags | Audit |
|---|---|---|---|---|---|---|---|
| Owner | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Admin | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Support | — | Yes | Yes | — | — | — | Yes |
| Billing | Yes | — | — | Yes | — | — | Yes |
| Engineer | — | — | — | — | — | — | Yes (read-only ops) |
| Viewer | — | — | — | — | — | — | Yes |

Privileged writes go through `company-ops` and `write_audit_log` with the actor user id.

## Engine reused

Career-Ops + `scripts/applypass-browser-worker.mjs`. Live adapters: Greenhouse, Lever, Ashby, Workable.

## Credits

Signup grants 25. Stripe `checkout.session.completed` grants 100 (Pro) or 400 (Autopilot) via `grant_credits`. One successful submit spends one. Failures refund. Checkout accepts `{ plan }` or `{ planType }`, enables Stripe promo codes, and returns to `/home?checkout=success`.

## How to operate

1. **Log in as owner** — sign in as `myfamily9006@gmail.com` (or `OWNER_EMAIL`). First `/admin` visit seeds Owner.
2. **Create a support user** — `/admin/team` → invite email as Support → they open `/invite/<token>` while signed in as that email.
3. **Paid credits** — customer hits `/plans` → Stripe Checkout (promo codes allowed) → webhook writes `user_access_controls` and `grant_credits`.
4. **Worker** — `npm run applypass:worker` (or `node scripts/applypass-browser-worker.mjs`) with `APPLYPASS_WORKER_TOKEN`.
5. **Live vs stub** — Greenhouse/Lever/Ashby/Workable submit is live. Workday/Jobvite, Outlook/Indeed/Naukri OAuth, and Workday vault persist stay stubbed until their env vars exist.

## Env

See `.env.example`. Client: `VITE_SUPABASE_*`, `VITE_ADMIN_OWNER_EMAILS`. Edge: `OWNER_EMAIL`, Stripe, worker token, `ALERT_WEBHOOK_URL`, optional `SENTRY_DSN`.
