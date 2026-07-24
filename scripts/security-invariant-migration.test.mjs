import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260724224000_security_invariant_reconciliation.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");

test("security reconciliation is a later idempotent migration", () => {
  assert.match(sql, /DROP CONSTRAINT IF EXISTS resumes_user_fkey/);
  assert.match(sql, /NOT VALID/);
  assert.match(sql, /VALIDATE CONSTRAINT resumes_user_fkey/);
  assert.match(sql, /SET lock_timeout = '5s'/);
});

test("resume import confirmation is owner-bound and fail-closed", () => {
  assert.match(sql, /WHERE id = p_resume_id AND user_id = caller_id/);
  assert.match(sql, /NOT IN \('passed', 'review_required'\)/);
  assert.match(sql, /this resume import is not eligible for review confirmation/);
  assert.match(sql, /\^\[a-f0-9\]\{64\}\$/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.confirm_resume_import_review\(uuid\)\s+TO authenticated/);
});

test("submission receipts require an active worker and database digest", () => {
  assert.match(sql, /application_receipts_evidence_digest_check/);
  assert.match(sql, /BEFORE INSERT ON public\.application_submission_receipts/);
  assert.match(sql, /task\.status = 'running'/);
  assert.match(sql, /task\.locked_by = p_worker_id/);
  assert.match(sql, /submission evidence is not confirmation-grade/);
  assert.match(sql, /workable-confirmation-container/);
  assert.match(sql, /submission_request_matched/);
  assert.match(sql, /ats-submission-application-id/);
  assert.match(sql, /ats-submission-explicit-success/);
  assert.doesNotMatch(sql, /'confirmation-text'/);
  assert.doesNotMatch(sql, /'form-replaced'/);
  assert.match(sql, /TO service_role/);
  assert.match(sql, /DROP POLICY IF EXISTS "Users acknowledge manual draft submission"/);
});

test("OTP secrets and leases fail closed", () => {
  assert.match(sql, /CHECK \(verification_code IS NULL\)/);
  assert.match(sql, /verification code was already consumed/);
  assert.match(sql, /verification code is actively leased/);
  assert.match(sql, /active_task\.heartbeat_at > now\(\) - interval '90 seconds'/);
  assert.match(sql, /mc_verification_code_tracked_job_owner_fkey[\s\S]*ON DELETE CASCADE/);
});

test("tracked status and Gmail ownership use constrained paths", () => {
  assert.match(sql, /GRANT UPDATE \([\s\S]*deleted_at[\s\S]*\) ON public\.mc_tracked_jobs TO authenticated/);
  const trackedGrantStart = sql.indexOf("GRANT UPDATE (\n  scanned_job_id");
  const trackedGrantEnd = sql.indexOf(
    ") ON public.mc_tracked_jobs TO authenticated",
    trackedGrantStart,
  );
  assert.ok(trackedGrantStart >= 0 && trackedGrantEnd > trackedGrantStart);
  const trackedUpdateGrant = sql.slice(trackedGrantStart, trackedGrantEnd);
  assert.doesNotMatch(
    trackedUpdateGrant,
    /\bstatus\b/,
  );
  assert.match(sql, /email\.session_id = p_session_id/);
  assert.match(sql, /email\.tracked_job_id = p_job_id/);
  assert.match(sql, /mc_inbound_emails_connection_owner_fkey[\s\S]*ON DELETE SET NULL \(gmail_connection_id\)/);
  assert.match(sql, /CHECK \(api_type <> 'manual' OR enabled = false\)/);
});
