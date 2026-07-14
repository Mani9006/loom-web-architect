-- ============================================================================
-- job_applications: add the (user_id, job_id) uniqueness the app assumes
-- ============================================================================
-- AutoApplyPage.tsx upserts into job_applications with
-- onConflict: "user_id,job_id", but no migration ever added a matching
-- unique constraint. Every "Auto Apply" click has been failing server-side
-- with "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" — silently, because the frontend never checked the error —
-- so no application was ever actually recorded.
-- ============================================================================

-- De-duplicate first (keep the most recently applied row per user+job) so the
-- unique constraint can be added safely even if duplicates already exist.
DELETE FROM public.job_applications a
USING public.job_applications b
WHERE a.user_id = b.user_id
  AND a.job_id = b.job_id
  AND a.job_id IS NOT NULL
  AND a.id <> b.id
  AND (a.applied_at, a.id) < (b.applied_at, b.id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_applications_user_job_unique'
  ) THEN
    ALTER TABLE public.job_applications
      ADD CONSTRAINT job_applications_user_job_unique UNIQUE (user_id, job_id);
  END IF;
END $$;
