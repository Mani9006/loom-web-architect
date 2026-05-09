# Security Policy

ResumePrep handles career documents, profile data, job applications, and integration credentials. Please treat all security concerns with care.

## Reporting a vulnerability

Do not open a public issue for suspected vulnerabilities, leaked credentials, or account/data exposure.

Instead, contact the repository owner through a private channel and include:

- A concise description of the issue
- Steps to reproduce, if safe to share
- Impacted routes, functions, tables, or workflows
- Any suggested remediation

## Security expectations

- Never commit API keys, Supabase service-role keys, tokens, or local `.env` files.
- Keep privileged operations in Supabase Edge Functions or other server-side contexts.
- Use Supabase RLS for user-owned data.
- Validate file uploads, external URLs, and AI/provider inputs before use.
- Review dependency and CI changes for supply-chain risk.

## Supported scope

Security review should prioritize current application code, Supabase migrations, edge functions, GitHub Actions workflows, deployment configuration, and automation scripts.
