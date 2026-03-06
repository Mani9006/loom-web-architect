# Claude Code - ResumePreps Remote Agent Configuration

## Project Overview

ResumePreps is a React + TypeScript web application for AI-powered resume building, job tracking, and automated job applications. It uses Vite, shadcn/ui, Tailwind CSS, Supabase (auth, database, edge functions), and deploys to Vercel.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, shadcn/ui, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions in Deno)
- **Deployment**: Vercel (automatic from main branch)
- **CI/CD**: GitHub Actions

## Repository Structure

```
src/                    # React application source
  components/           # UI components (shadcn + custom)
  pages/                # Route pages
  hooks/                # Custom React hooks
  lib/                  # Utilities and Supabase client
  integrations/         # External service integrations
supabase/
  functions/            # Deno edge functions
  migrations/           # Database migrations
public/                 # Static assets
scripts/                # CI/CD and automation scripts
.github/
  workflows/            # GitHub Actions workflows
  agents/               # Agent role definitions
```

## Development Commands

```bash
npm run dev             # Start dev server
npm run build           # Production build
npm run type-check      # TypeScript type checking
npm run lint            # ESLint
npm run test            # Run vitest tests
npm run hq:gate         # Full release gate: type-check + test + build
```

## Quality Gates

Before committing any change, validate with:

1. `npm run type-check` - Must pass with zero errors
2. `npm run test` - All tests must pass
3. `npm run build` - Production build must succeed
4. `npm run lint` - No lint errors (warnings acceptable)

## Agent Roles

When working on tickets, Claude Code operates as the unified remote agent replacing the previous 9 local OpenClaw agents. Route work based on the ticket context:

- **Frontend/UI work**: Focus on `src/components/` and `src/pages/`
- **Backend/API work**: Focus on `supabase/functions/` and `src/integrations/`
- **DevOps/Release**: Focus on `.github/workflows/`, deployment configs
- **QA/Testing**: Focus on test files, `qa/` directory
- **Performance**: Focus on bundle analysis, lazy loading, caching

## Commit Convention

- Reference Jira ticket in commit message: `[KAN-XX] description`
- Keep commits focused and atomic
- Run quality gates before committing

## Security Rules

- Never commit secrets, API keys, or tokens
- Never expose Supabase service role keys in client code
- Use environment variables for all credentials
- Edge functions use `Deno.env.get()` for secrets

## Architecture Decisions

- Frontend fetches data via Supabase client (not direct API calls)
- Edge functions handle server-side logic (AI calls, external APIs)
- Job search uses Supabase edge function (not n8n webhooks)
- Authentication via Supabase Auth with RLS policies
