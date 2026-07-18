-- Observable application-worker health. Users may read only their own latest
-- heartbeat; only the service-role queue handler writes runtime state.
CREATE TABLE IF NOT EXISTS public.mc_worker_heartbeats (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname text,
  version text,
  last_seen timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mc_worker_heartbeat_owner_select" ON public.mc_worker_heartbeats;
CREATE POLICY "mc_worker_heartbeat_owner_select"
  ON public.mc_worker_heartbeats
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.mc_worker_heartbeats FROM anon, authenticated;
GRANT SELECT ON public.mc_worker_heartbeats TO authenticated;

CREATE INDEX IF NOT EXISTS mc_worker_heartbeats_last_seen_idx
  ON public.mc_worker_heartbeats (last_seen DESC);
