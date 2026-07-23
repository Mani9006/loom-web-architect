-- Audit trail for the tailor critic loop (career-ops-tailor).
-- jsonb array of { iteration, pass, top_rejection_reasons, fixes } entries,
-- one per critic evaluation run before the draft was finalized.
alter table public.draft_applications
  add column if not exists critic_iterations jsonb not null default '[]'::jsonb;
