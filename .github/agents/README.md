# GitHub Custom Agents

This directory defines custom GitHub agent profiles for `gh agent-task create --custom-agent <name>`.
Each profile file must use the `*.agent.md` naming convention.

## Available agents

- `orchestrator`: Engineering orchestration and ticket breakdown.
- `frontend_ui`: UI and UX implementation.
- `backend_api`: Supabase and API implementation.
- `ai_runtime`: AI routing, prompts, and model runtime behavior.
- `resume_domain`: ATS and resume output quality.
- `qa_automation`: Tests, regression coverage, CI confidence.
- `performance_optimizer`: Bundle/runtime/perf optimization.
- `security_guardian`: Secret handling and security hardening.
- `devops_release`: Build/release/deploy safety.

## Jira owner alias mapping

- `atlas` -> `orchestrator`
- `anu` -> `orchestrator`
- `forge` -> `backend_api`
- `pixel` -> `frontend_ui`
- `sentinel` -> `devops_release`
- `prism` -> `qa_automation`
- `scout` -> `orchestrator`
- `lens` -> `performance_optimizer`
- `spark` -> `resume_domain`
