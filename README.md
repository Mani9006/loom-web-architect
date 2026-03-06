# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Remote Agent Architecture (Claude Code)

All agent orchestration now runs **remotely via GitHub Actions** instead of locally on Mac Mini. This replaces the previous OpenClaw AI local agent system.

### GitHub Actions Workflows

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| `hq-control-loop.yml` | Every 6 hours | Governance checks, quality gate, security audit, Slack notifications |
| `claude-code-agent.yml` | On issue/dispatch | Claude Code agent for ticket execution |
| `jira-sync.yml` | Every 4 hours | Sync Jira review tickets and send Slack alerts |

### How to trigger agent work

1. **Create a GitHub issue** with the `agent-task` label
2. **Manual dispatch**: `gh workflow run claude-code-agent.yml -f task="your task here"`
3. **Scheduled**: Workflows run automatically on schedule

### In-app control surfaces

- In-app command surface at `/control-center`
- Owner Admin Portal at `/admin` (owner-only)
- Edge function: `supabase/functions/executive-brief`
- Edge function: `supabase/functions/admin-portal`

### What it tracks

- Deployment state from GitHub/Vercel status
- Jira execution load (open, in-progress, review)
- Platform growth volume (users, resumes, tracked jobs, conversations, cover letters)
- Quality gates (type-check, tests, build)
- Security audit for secret leaks

### Local commands (for manual one-off use only)

- `npm run hq:gate` - Full release gate: type-check + test + build
- `npm run hq:governor:dry` - Safe Jira governance dry-run
- `npm run hq:brief` - Generate executive brief
- `npm run security:audit` - Check for leaked secrets
- `npm run hq:loop:dry` - Dry run of the deprecated local loop

### Required GitHub repository secrets

Set these in GitHub Settings > Secrets > Actions:

- `JIRA_URL`, `JIRA_USER`, `JIRA_TOKEN` (for Jira integration)

### Required GitHub repository variables

Set these in GitHub Settings > Variables > Actions:

- `SLACK_WEBHOOK_URL` (Slack incoming webhook for notifications)
- `JIRA_PROJECT_KEY` (default `KAN`)
- `ENABLE_HQ_LOOP` (default `1`, set `0` to disable scheduled runs)

### Required edge function secrets

Set these in Supabase project secrets before deploying `executive-brief`:

- `JIRA_BASE_URL`
- `JIRA_USER`
- `JIRA_API_TOKEN`
- Optional: `EXECUTIVE_GITHUB_REPO` (defaults to `Mani9006/loom-web-architect`)
- Optional: `EXECUTIVE_JIRA_PROJECT` (defaults to `KAN`)

Set these in Supabase project secrets for `admin-portal`:

- `ADMIN_OWNER_EMAILS` (comma-separated, defaults to `myfamily9006@gmail.com`)
- Optional cost model inputs:
  `ADMIN_OPENAI_SHARE`,
  `ADMIN_OPENAI_INPUT_USD_PER_1K`,
  `ADMIN_OPENAI_OUTPUT_USD_PER_1K`,
  `ADMIN_ANTHROPIC_INPUT_USD_PER_1K`,
  `ADMIN_ANTHROPIC_OUTPUT_USD_PER_1K`,
  `ADMIN_VERCEL_MONTHLY_USD`,
  `ADMIN_SUPABASE_MONTHLY_USD`,
  `ADMIN_MEM0_MONTHLY_USD`,
  `ADMIN_PERPLEXITY_MONTHLY_USD`,
  `ADMIN_OTHER_INFRA_MONTHLY_USD`

Set these in Supabase project secrets for token controls and usage alerts:

- `USAGE_GUARD_MONTHLY_TOKEN_BUDGET` (default `1500000`)
- `USAGE_GUARD_DAILY_TOKEN_BUDGET` (default monthly/30)
- `USAGE_GUARD_WARN_AT` (default `0.8`)
- `USAGE_GUARD_CRITICAL_AT` (default `0.95`)
- `CHAT_MAX_CONTEXT_MESSAGES` (default `12`)
- `CHAT_MAX_TOKENS_DEFAULT` (default `1200`)
- `CHAT_MAX_TOKENS_ATS` (default `2500`)
- `CHAT_MAX_TOKENS_RESUME_PARSE` (default `6000`)
- `CHAT_MEM0_RESULT_LIMIT` (default `8`)
- `RESUME_CHAT_MAX_TOKENS_INITIAL` (default `3500`)
- `RESUME_CHAT_MAX_TOKENS_FOLLOWUP` (default `1800`)
- `RESUME_CHAT_MAX_TOKENS_CAP` (default `6000`)
- `RESUME_CHAT_INITIAL_CONTEXT_MAX_CHARS` (default `18000`)
- `RESUME_CHAT_CURRENT_RESUME_MAX_CHARS` (default `12000`)
- `ORCHESTRATOR_MAX_TOKENS_DEFAULT` (default `1200`)
- `ORCHESTRATOR_MAX_TOKENS_COMPLEX` (default `1800`)
