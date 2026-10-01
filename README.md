# ResumePrep

ResumePrep is an AI-powered career platform for building ATS-ready resumes, creating tailored cover letters, practicing interviews, tracking job applications, and managing career workflows from one workspace.

## What this project includes

- **Resume Builder**: Structured resume editing, templates, previews, exports, and ATS quality checks.
- **AI Career Workspace**: Chat-driven support for resumes, cover letters, interviews, and job search workflows.
- **Job Search & Tracking**: Saved jobs, application tracking, matching, analytics, and collection workflows.
- **Auto Apply / ApplyPass**: Assisted application flows and browser-worker automation support.
- **Admin & Control Center**: Owner-only operational views, executive brief generation, governance checks, and release monitoring.
- **Supabase Backend**: Auth, PostgreSQL, RLS-backed data access, migrations, and Deno edge functions.

## Tech stack

| Area | Tools |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, React Router |
| UI | shadcn/ui, Radix UI, Tailwind CSS, Lucide icons |
| State & data | TanStack Query, Supabase client |
| Backend | Supabase Auth, PostgreSQL, Edge Functions |
| Testing | Vitest, Testing Library, Playwright |
| Deployment | Vercel, GitHub Actions |

## Repository structure

```text
src/                    React application source
  components/           Shared UI, product surfaces, layouts
  pages/                Route-level pages
  hooks/                Reusable React hooks
  lib/                  Utilities, analytics, scoring, domain logic
  integrations/         Supabase client and generated types
supabase/
  functions/            Supabase Edge Functions
  migrations/           Database migrations and policies
scripts/                Operations, governance, metrics, and automation scripts
docs/                   Product, operations, and readiness documentation
qa/                     QA execution reports and validation artifacts
.github/workflows/      CI, remote-agent, and release automation
```

## Getting started

### Prerequisites

- Node.js 20+ recommended
- npm
- Supabase project credentials for full local integration testing

### Install

```sh
npm ci
```

### Run locally

```sh
npm run dev
```

The Vite dev server prints the local URL after startup.

## Environment configuration

Create a local `.env` file for secrets and environment-specific values. Do not commit local environment files.

Common frontend values:

```sh
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"
```

Supabase edge functions use Supabase project secrets via `Deno.env.get()` for service credentials, AI providers, Jira, Slack, and operational integrations. See the relevant runbooks in `docs/` and `supabase/functions/` before deploying backend changes.

## Quality gates

Run the same checks used for release confidence:

```sh
npm run type-check
npm run test
npm run build
npm run lint
```

Or run the consolidated release gate:

```sh
npm run hq:gate
```

`hq:gate` currently runs type checking, tests, and a production build. Run ESLint on every changed file; the repository-wide lint backlog is documented as cleanup work and should be reduced without hiding new violations.

Additional useful commands:

```sh
npm run security:audit       # Secret-leak and security-oriented repository scan
npm run build:metrics        # Production build with bundle metrics
npm run qa:e2e               # Playwright end-to-end tests
npm run hq:brief             # Generate an executive operations brief
```

## Development workflow

1. Create a focused branch for the change.
2. Keep commits small and descriptive.
3. Update tests or documentation when behavior changes.
4. Run the relevant quality gates before opening a pull request.
5. Use the pull request template to document scope, validation, risks, and rollout notes.

## Remote agent operations

Remote agent orchestration runs through GitHub Actions rather than local agent processes.

| Workflow | Purpose |
| --- | --- |
| `hq-control-loop.yml` | Scheduled governance checks, quality gates, security audit, and notifications |
| `claude-code-agent.yml` | Remote coding-agent execution from issues or manual dispatch |
| `jira-sync.yml` | Jira review-ticket sync and operational alerts |

Agent work can be triggered by creating a GitHub issue with the `agent-task` label or by manually dispatching the Claude Code workflow with a task description.

## Security notes

- Never commit secrets, API keys, local `.env` files, or Supabase service-role keys.
- Keep service-role credentials server-side only.
- Use RLS policies and authenticated Supabase access for user-owned data.
- Review `SECURITY.md` before reporting or handling vulnerabilities.

## Documentation index

- `docs/architecture.md` — system map, where each component runs, apply pipeline data flow, scaling path
- `docs/adr/` — architecture decision records
- `CONTRIBUTING.md` — branches, PRs, quality gates, regenerating Supabase types
- `docs/env-inventory.md` — every environment variable and where it is read (generated: `npm run env:inventory`)
- `docs/CAREER_OPS_RUNBOOK.md` — career operations workflows
- `docs/product-rescue-blueprint.md` — live product audit, market map, target architecture, and delivery sequence
- `docs/infrastructure-decision.md` — zero-operations hosting, CI/CD, AI-review budget, and Jenkins/Kubernetes decision
- `docs/release-runbook.md` — development/staging/production promotion, QA accounts, smoke tests, and rollback
- `docs/applypass-browser-worker.md` — ApplyPass worker operations
- `docs/enterprise-readiness-blueprint.md` — enterprise readiness plan
- `docs/growth-experiment-fabric.md` — growth experimentation system
- `docs/archive/` — historical status reports, sprint logs and one-off fix notes (not maintained; includes the old `QUICK_START.md`, `SETUP_GUIDE.md` and `DEPLOYMENT_RELIABILITY_CHECKLIST.md`)

## License

No license file is currently included. Treat this repository as proprietary unless a license is added by the owner.
