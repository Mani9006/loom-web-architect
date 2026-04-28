-- ============================================================================
-- My Collection — self-contained job-search workspace
-- ============================================================================
-- This migration is ADDITIVE ONLY. It does not modify any existing table.
-- All new tables are prefixed `mc_` so they cannot collide with existing
-- schema (jobs, applications, tracked_jobs, draft_applications, etc.).
--
-- The My Collection feature reads from existing tables (scanned_jobs,
-- resumes) but writes only to mc_* tables.
-- ============================================================================

-- ── 1. Sessions ─────────────────────────────────────────────────────────
-- Each user can have up to 5 active + N archived sessions. A session is a
-- standalone job-search context: master resume, target profile, evaluations,
-- tailored resumes, kanban state, all isolated.

CREATE TABLE IF NOT EXISTS mc_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  master_resume_id  uuid REFERENCES resumes(id) ON DELETE SET NULL,
  target_profile    jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- shape: {
    --   target_roles: string[],
    --   archetypes: { name, level, fit }[],
    --   target_locations: string[],
    --   remote_only: boolean,
    --   visa_status: string,
    --   comp_min: number,
    --   comp_target: number,
    --   comp_max: number,
    --   exclude_companies: string[],
    -- }
  template_id       text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mc_sessions_user_status_idx
  ON mc_sessions (user_id, status, updated_at DESC);

ALTER TABLE mc_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_sessions_owner_all" ON mc_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION mc_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mc_sessions_touch_updated_at
  BEFORE UPDATE ON mc_sessions
  FOR EACH ROW EXECUTE FUNCTION mc_touch_updated_at();

-- ── 2. Per-session evaluations (cached scoring) ────────────────────────
-- Reads from existing scanned_jobs but writes here. Saves redundant Sonnet
-- calls — if a job is already scored for a session, don't re-score.

CREATE TABLE IF NOT EXISTS mc_evaluations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES mc_sessions(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scanned_job_id    uuid NOT NULL,    -- references scanned_jobs(id) but no FK (loose coupling)
  score             numeric(3,1) CHECK (score >= 0 AND score <= 5),
  tier              text CHECK (tier IN ('A', 'B', 'C', 'D', 'F')),
  archetype         text,
  summary           text,
  keyword_matches   jsonb,
  gaps              jsonb,
  star_stories      jsonb,
  report_md         text,
  model             text NOT NULL DEFAULT 'sonnet-4-6',
  tokens_in         integer DEFAULT 0,
  tokens_out        integer DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, scanned_job_id)
);

CREATE INDEX IF NOT EXISTS mc_evaluations_session_score_idx
  ON mc_evaluations (session_id, score DESC NULLS LAST);

ALTER TABLE mc_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_evals_owner_all" ON mc_evaluations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 3. Per-session tailored resumes ────────────────────────────────────
-- One row per resume variant. Owned by a session. Optional source job link.

CREATE TABLE IF NOT EXISTS mc_tailored_resumes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES mc_sessions(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_job_id     uuid,                 -- references scanned_jobs(id), nullable
  source_evaluation_id uuid REFERENCES mc_evaluations(id) ON DELETE SET NULL,
  name              text NOT NULL,        -- user-editable filename
  cv_md             text NOT NULL,        -- the markdown source of truth
  rendered_html     text,                  -- cached HTML for preview
  pdf_url           text,                  -- cached PDF if generated
  docx_url          text,                  -- cached DOCX if generated
  ats_score         numeric(4,1),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mc_tailored_session_idx
  ON mc_tailored_resumes (session_id, updated_at DESC);

ALTER TABLE mc_tailored_resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_tailored_owner_all" ON mc_tailored_resumes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER mc_tailored_touch_updated_at
  BEFORE UPDATE ON mc_tailored_resumes
  FOR EACH ROW EXECUTE FUNCTION mc_touch_updated_at();

-- ── 4. Per-session kanban state ────────────────────────────────────────
-- Kanban cards. Each row = one job in this session's pipeline.
-- Status moves automatically based on email signals (Phase 3).

CREATE TABLE IF NOT EXISTS mc_tracked_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES mc_sessions(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scanned_job_id    uuid,                 -- nullable for jobs added manually
  job_title         text NOT NULL,
  company           text NOT NULL,
  location          text,
  apply_url         text,
  jd_md             text,                  -- snapshot of JD at time of save
  tailored_resume_id uuid REFERENCES mc_tailored_resumes(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'discovered'
    CHECK (status IN ('discovered','saved','applied','viewed','interview','take_home','offer','hold','rejected','withdrawn')),
  applied_at        timestamptz,
  clicked_at        timestamptz,           -- when user clicked the apply link
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mc_tracked_session_status_idx
  ON mc_tracked_jobs (session_id, status, updated_at DESC);

ALTER TABLE mc_tracked_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_tracked_owner_all" ON mc_tracked_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER mc_tracked_touch_updated_at
  BEFORE UPDATE ON mc_tracked_jobs
  FOR EACH ROW EXECUTE FUNCTION mc_touch_updated_at();

-- ── 5. Status change history (audit trail for kanban moves) ────────────

CREATE TABLE IF NOT EXISTS mc_status_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_job_id    uuid NOT NULL REFERENCES mc_tracked_jobs(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status_from       text,
  status_to         text NOT NULL,
  source            text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','email','auto_apply','agent','import')),
  email_id          uuid,                  -- reference to mc_inbound_emails when source=email
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mc_history_tracked_idx
  ON mc_status_history (tracked_job_id, created_at DESC);

ALTER TABLE mc_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_history_owner_select" ON mc_status_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mc_history_owner_insert" ON mc_status_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── 6. Inbound emails (Phase 3 — email watcher writes here) ────────────

CREATE TABLE IF NOT EXISTS mc_inbound_emails (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        uuid REFERENCES mc_sessions(id) ON DELETE SET NULL,
  tracked_job_id    uuid REFERENCES mc_tracked_jobs(id) ON DELETE SET NULL,
  message_id        text UNIQUE,
  from_email        text NOT NULL,
  to_email          text,
  subject           text,
  body_preview      text,
  body_full         text,
  classification    text,
    -- one of: confirmation | interview_invite | take_home | reject | offer | other_recruiter | irrelevant
  classification_confidence numeric(3,2),
  classification_summary text,
  next_action       text,
  parsed_at         timestamptz,
  raw               jsonb,
  received_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mc_emails_user_received_idx
  ON mc_inbound_emails (user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS mc_emails_tracked_idx
  ON mc_inbound_emails (tracked_job_id);

ALTER TABLE mc_inbound_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_emails_owner_all" ON mc_inbound_emails
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 7. Per-session per-day token budget enforcement ───────────────────
-- Optional but recommended — prevent runaway Sonnet costs per session.

CREATE TABLE IF NOT EXISTS mc_ai_usage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        uuid NOT NULL REFERENCES mc_sessions(id) ON DELETE CASCADE,
  day               date NOT NULL DEFAULT current_date,
  kind              text NOT NULL,
    -- evaluation | tailor | rewrite_line | classify_email | draft_answers | other
  model             text NOT NULL,
  count             integer NOT NULL DEFAULT 1,
  tokens_in         integer NOT NULL DEFAULT 0,
  tokens_out        integer NOT NULL DEFAULT 0,
  cents_estimated   integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, day, kind, model)
);

CREATE INDEX IF NOT EXISTS mc_usage_user_day_idx
  ON mc_ai_usage (user_id, day DESC);

ALTER TABLE mc_ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_usage_owner_select" ON mc_ai_usage
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mc_usage_owner_insert" ON mc_ai_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mc_usage_owner_update" ON mc_ai_usage
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- Done. Reverse with:
--   DROP TABLE mc_ai_usage, mc_inbound_emails, mc_status_history,
--              mc_tracked_jobs, mc_tailored_resumes, mc_evaluations, mc_sessions
--              CASCADE;
--   DROP FUNCTION mc_touch_updated_at();
-- ============================================================================
