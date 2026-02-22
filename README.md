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

## Executive Control Center (New)

This repo now includes an HQ-grade control layer inspired by top OpenClaw showcase patterns:

- In-app command surface at `/control-center`
- Edge function: `supabase/functions/executive-brief`
- Local automation brief: `npm run hq:brief`
- Jira governance loop: `npm run hq:governor`
- Atlas ticket-to-agent dispatch: `npm run atlas:dispatch`
- GitHub agent-task dispatch: `npm run github:agents:dispatch`
- Secret audit gate: `npm run security:audit`
- End-to-end loop: `npm run hq:loop`
- Release gate command: `npm run hq:gate`

### What it tracks

- Deployment state from GitHub/Vercel status
- Jira execution load (open, in-progress, review)
- Platform growth volume (users, resumes, tracked jobs, conversations, cover letters)
- Priority actions with explicit owner mapping
- Ticket dispatch state in `.openclaw/reports/atlas-dispatch-state.json`
- Runtime reports in `.openclaw/reports/`

### Local control commands

- `npm run hq:governor:dry` for safe Jira governance dry-run.
- `npm run atlas:dispatch:dry` to preview Atlas -> agent routing without execution.
- `npm run github:agents:dispatch:dry` to preview Jira -> GitHub agent-task creation.
- `npm run hq:loop:dry` to run dry governance + dry dispatch + brief + security audit.
- `npm run hq:loop` to run the live control loop (includes GitHub agent-task dispatch).

### Optional env vars for dispatch/governor

- `JIRA_URL`, `JIRA_USER`, `JIRA_TOKEN`
- `HQ_WIP_LIMIT` (default `5`)
- `HQ_WIP_EXEMPT_KEYS` (default `KAN-10,KAN-14,KAN-22`)
- `ATLAS_DISPATCH_MAX` (default `9`)
- `ATLAS_EXEMPT_KEYS` (default `KAN-10`)
- `ATLAS_AGENT_ALIAS_MAP` (JSON for alias override mapping)
- `GITHUB_AGENT_REPO` (default `Mani9006/loom-web-architect`)
- `GITHUB_AGENT_BASE` (default current branch)
- `GITHUB_AGENT_DISPATCH_MAX` (default `3`)
- `GITHUB_AGENT_EXEMPT_KEYS` (default `KAN-10,KAN-22`)
- `ENABLE_GITHUB_AGENT_DISPATCH` (default `1`, set `0` to skip in loop)
- `OPENCLAW_CODEX_SANDBOX` (default `danger-full-access`)
- `OPENCLAW_CODEX_APPROVAL` (default `never`)
- `JIRA_OWNER_ACCOUNT_MAP` (JSON map owner alias -> Jira accountId for assignee correction)

### Required edge function secrets

Set these in Supabase project secrets before deploying `executive-brief`:

- `JIRA_BASE_URL`
- `JIRA_USER`
- `JIRA_API_TOKEN`
- Optional: `EXECUTIVE_GITHUB_REPO` (defaults to `Mani9006/loom-web-architect`)
- Optional: `EXECUTIVE_JIRA_PROJECT` (defaults to `KAN`)
