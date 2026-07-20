-- ============================================================================
-- My Collection — Gmail OAuth + Company Research tables (Phase 2 add-on)
-- ============================================================================

-- ── Gmail OAuth connection per session ──────────────────────────────────
-- Each session can connect ONE Gmail account. The agent reads the inbox
-- (read-only scope), classifies emails relevant to that session's tracked
-- jobs, and updates kanban status accordingly.
--
-- Tokens are encrypted at rest via Supabase Vault (recommended) or stored
-- in plaintext only if Vault unavailable (NOT for production).

CREATE TABLE IF NOT EXISTS mc_gmail_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        uuid NOT NULL REFERENCES mc_sessions(id) ON DELETE CASCADE,
  gmail_email       text NOT NULL,
  access_token      text NOT NULL,         -- store encrypted via Vault in prod
  refresh_token     text NOT NULL,         -- store encrypted via Vault in prod
  token_expires_at  timestamptz NOT NULL,
  scopes            text[] NOT NULL,
  history_id        text,                   -- last Gmail history ID we processed
  last_polled_at    timestamptz,
  enabled           boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id)                       -- one connection per session
);

CREATE INDEX IF NOT EXISTS mc_gmail_user_idx
  ON mc_gmail_connections (user_id, enabled);

ALTER TABLE mc_gmail_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mc_gmail_owner_all" ON mc_gmail_connections;
CREATE POLICY "mc_gmail_owner_all" ON mc_gmail_connections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS mc_gmail_touch_updated_at ON mc_gmail_connections;
CREATE TRIGGER mc_gmail_touch_updated_at
  BEFORE UPDATE ON mc_gmail_connections
  FOR EACH ROW EXECUTE FUNCTION mc_touch_updated_at();

-- ── Per-session company research cache (Gemini-powered) ─────────────────
-- When the user opens a job from a company we haven't researched yet,
-- a cheap Gemini 2.0 Flash call generates: company summary, recent news,
-- culture signals, interview style. Cached per (session, company).

CREATE TABLE IF NOT EXISTS mc_company_research (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        uuid NOT NULL REFERENCES mc_sessions(id) ON DELETE CASCADE,
  company_slug      text NOT NULL,
  company_name      text NOT NULL,
  research_md       text NOT NULL,           -- structured markdown
  source_urls       jsonb,                    -- citations
  model             text NOT NULL DEFAULT 'gemini-2.0-flash',
  tokens_in         integer DEFAULT 0,
  tokens_out        integer DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  UNIQUE (session_id, company_slug)
);

CREATE INDEX IF NOT EXISTS mc_research_session_idx
  ON mc_company_research (session_id);

ALTER TABLE mc_company_research ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mc_research_owner_all" ON mc_company_research;
CREATE POLICY "mc_research_owner_all" ON mc_company_research
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Reverse:
--   DROP TABLE mc_gmail_connections, mc_company_research CASCADE;
-- ============================================================================
