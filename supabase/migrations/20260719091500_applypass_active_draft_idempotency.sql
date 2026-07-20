-- A draft can have only one active browser submission. This closes the race
-- between UI retries, double-clicks, and the scheduled Continuous Apply run.
create unique index if not exists applypass_tasks_one_active_draft_idx
  on public.applypass_tasks (user_id, ((payload ->> 'draft_application_id')))
  where task_type = 'career_ops_submit'
    and status in ('pending', 'running')
    and payload ? 'draft_application_id';
