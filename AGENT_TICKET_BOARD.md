# Agent Ticket Board

Last updated: 2026-02-21

## 1) orchestrator (Engineering Orchestrator)
- Ticket: Route app AI requests through orchestrator endpoint with explicit intent hints.
- Status: DONE (Phase 1)
- Evidence: `src/pages/Chat.tsx`, `src/pages/ATSCheckerPage.tsx`, `src/pages/CoverLetterPage.tsx`, `src/pages/InterviewPrepPage.tsx`, `src/pages/CoverLettersPage.tsx`, `src/pages/AIToolbox.tsx`, `src/components/chat/VoiceInterviewSimulation.tsx`, `src/lib/ai-resume-parser.ts`, `src/components/resume/EnhancedResumeForm.tsx`.

## 2) frontend_ui (Frontend UI Engineer)
- Ticket: Remove wrong Supabase fallback URL risk in Job Search flow.
- Status: DONE
- Evidence: `src/components/chat/JobSearchPanel.tsx`.

## 3) backend_api (Backend API Engineer)
- Ticket: Harden edge function auth for unauthenticated paths.
- Status: DONE
- Evidence: `supabase/functions/enhance-bullet/index.ts`, `supabase/config.toml`.

## 4) ai_runtime (AI Runtime Engineer)
- Ticket: Accept both `mode` and `agentHint` for backward compatibility in orchestrator.
- Status: DONE
- Evidence: `supabase/functions/ai-orchestrator/index.ts`.

## 5) resume_domain (Resume Domain Specialist)
- Ticket: Keep resume parse flows available while moving runtime routing to orchestrator.
- Status: DONE
- Evidence: `src/components/resume/EnhancedResumeForm.tsx`, `src/lib/ai-resume-parser.ts`.

## 6) qa_automation (QA Automation Engineer)
- Ticket: Add CI test gate and verify build/typecheck/tests.
- Status: DONE (Phase 1)
- Evidence: `.github/workflows/ci.yml`, `package.json`.

## 7) performance_optimizer (Performance Optimizer)
- Ticket: Reduce known dependency risk and keep production build healthy.
- Status: PARTIAL
- Done: upgraded `jspdf` to `^4.2.0`.
- Remaining: large bundle optimization and transitive `glob/minimatch/sucrase` audit chain.
- Evidence: `package.json`, `package-lock.json`.

## 8) security_guardian (Security Guardian)
- Ticket: Remove hardcoded secrets and unsafe admin auto-assignment logic.
- Status: DONE (Phase 1)
- Evidence: `supabase/.env.example`, `deploy-job-search.sh`, `SETUP_GUIDE.md`, `FIXES_COMPLETE.md`, `test-job-search.sh`, `supabase/migrations/20260221103000_remove_email_admin_auto_assign.sql`, `.env.example`, untracked `.env` from git.

## 9) devops_release (DevOps and Release Engineer)
- Ticket: Align backend deploy workflow with actual Supabase architecture.
- Status: DONE (workflow) / BLOCKED (live deploy)
- Done: replaced Fly workflow with Supabase function deploy workflow.
- Blocker: no `SUPABASE_ACCESS_TOKEN` available in local shell.
- Evidence: `.github/workflows/deploy-backend.yml`.
