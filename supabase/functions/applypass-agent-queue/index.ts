import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  enforceAutoApplyEntitlement,
  enforceMonthlyAutoApplyExecutionCap,
} from "../_shared/guards.ts";
import { classifyAtsApplyUrl } from "../_shared/ats-url-policy.ts";
import { decryptSecret } from "../_shared/oauth-crypto.ts";
import {
  getResumeReviewState,
  RESUME_REVIEW_REQUIRED_MESSAGE,
} from "../_shared/resume-review.ts";
import {
  senderDomainBoundToOtpTarget,
  verifyOtpJobTarget,
  type OtpVerifiedSource,
} from "../_shared/gmail-otp-trust.ts";
import { hasVerifiedSubmissionEvidence } from "../_shared/submission-receipt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-applypass-worker-token, x-worker-id",
};

type QueueAction =
  | "enqueue"
  | "list"
  | "cancel"
  | "claim-next"
  | "heartbeat"
  | "authorization-status"
  | "verification-code"
  | "verification-code-result"
  | "complete"
  | "fail";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getWorkerToken(req: Request, body: Record<string, unknown>): string {
  return (
    req.headers.get("x-applypass-worker-token") ||
    (typeof body.workerToken === "string" ? body.workerToken : "") ||
    ""
  );
}

function workerAuthorized(req: Request, body: Record<string, unknown>): boolean {
  const expected = Deno.env.get("APPLYPASS_WORKER_TOKEN") || Deno.env.get("WORKER_AUTH_TOKEN") || "";
  if (!expected) return false;
  const actual = getWorkerToken(req, body);
  return Boolean(actual) && actual === expected;
}

function createServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing SUPABASE_URL or SERVICE_ROLE_KEY for worker actions.");
  }
  return createClient(supabaseUrl, serviceRole);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function recordSubmissionReceipts(
  serviceClient: ReturnType<typeof createServiceClient>,
  taskId: string,
  workerId: string,
  taskContext: Record<string, unknown>,
  result: unknown,
): Promise<void> {
  const payload = asRecord(taskContext.payload);
  const expectedJobs = Array.isArray(payload.jobs) ? payload.jobs.map(asRecord) : [];
  const resultJobs = Array.isArray(asRecord(result).jobs)
    ? (asRecord(result).jobs as unknown[]).map(asRecord)
    : [];

  for (const resultJob of resultJobs) {
    if (!hasVerifiedSubmissionEvidence(resultJob, payload)) continue;
    const expected = expectedJobs.find((job) => asString(job.id) === asString(resultJob.jobId));
    if (!expected) continue;
    const target = classifyAtsApplyUrl(expected.url);
    if (!target.supported) continue;

    const submittedAt = new Date().toISOString();
    const evidence = {
      receipt: asRecord(resultJob.receipt),
      submission_response_status: Number(resultJob.submissionResponseStatus) || null,
      submission_response_path: asString(resultJob.submissionResponsePath) || null,
      submission_request_matched: resultJob.submissionRequestMatched === true,
      transport_signal: asString(resultJob.submissionTransportSignal) || null,
      transport_application_id: asString(resultJob.submissionTransportApplicationId) || null,
      transport_confirmed: resultJob.submissionTransportConfirmed === true,
      adapter: asString(resultJob.adapter) || target.type,
      captured_at: submittedAt,
    };
    const { error } = await serviceClient
      .rpc("record_application_submission_receipt", {
        p_task_id: taskId,
        p_worker_id: workerId,
        p_tracked_job_id: asString(expected.trackedJobId) || asString(payload.tracked_job_id) || null,
        p_draft_application_id: asString(payload.draft_application_id) || null,
        p_job_id: asString(expected.id),
        p_provider: target.type,
        p_apply_url: target.normalizedUrl,
        p_evidence: evidence,
      });
    if (error) throw new Error(`submission_receipt_store_failed:${error.message}`);
  }
}

async function getUserEmail(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<string | null> {
  const { data } = await serviceClient.auth.admin.getUserById(userId);
  return data?.user?.email || null;
}

// Best-effort outcome notification. A failed email send must NEVER break
// complete/fail processing, so every failure path here only logs.
async function notifyApplyOutcome(
  serviceClient: ReturnType<typeof createServiceClient>,
  taskContext: Record<string, unknown>,
  outcome: "submitted" | "failed",
  detail: { submittedAt?: string; errorMessage?: string },
) {
  try {
    const payload = asRecord(taskContext.payload);
    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    const firstJob = asRecord(jobs[0]);
    const jobTitle = asString(payload.job_title) || asString(firstJob.title);
    const company = asString(payload.company_name) || asString(firstJob.company);
    const portal = asString(payload.portal);
    const userId = asString(taskContext.user_id);
    if (!userId) return;

    const to = await getUserEmail(serviceClient, userId);
    if (!to) {
      console.warn(`[applypass-agent-queue] outcome email skipped: no email for user ${userId}`);
      return;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceKey) return;

    const internalToken = Deno.env.get("INTERNAL_EMAIL_TOKEN") || "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    };
    if (internalToken) headers["x-internal-token"] = internalToken;

    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: outcome === "submitted" ? "application-submitted" : "application-failed",
        to,
        data: {
          job_title: jobTitle,
          company,
          portal,
          submitted_at: detail.submittedAt,
          reason: detail.errorMessage,
        },
      }),
    });
    if (!res.ok) console.error(`[applypass-agent-queue] outcome email failed (${outcome}):`, await res.text());
    else console.log(`[applypass-agent-queue] sent ${outcome} outcome email for task user ${userId}`);
  } catch (err) {
    console.error(`[applypass-agent-queue] outcome email error (${outcome}):`, err);
  }
}

async function syncCareerDraft(
  serviceClient: ReturnType<typeof createServiceClient>,
  taskContext: Record<string, unknown> | null,
  outcome: "complete" | "fail",
  result: unknown,
  errorMessage?: string,
) {
  if (!taskContext || taskContext.task_type !== "career_ops_submit") return;
  const payload = asRecord(taskContext.payload);
  const draftId = typeof payload.draft_application_id === "string" ? payload.draft_application_id : "";
  const trackedJobId = typeof payload.tracked_job_id === "string" ? payload.tracked_job_id : "";
  const userId = typeof taskContext.user_id === "string" ? taskContext.user_id : "";
  if (!draftId || !userId) return;

  // Read the current draft status first so outcome emails only fire on an
  // actual status transition — retried complete/fail calls that find the
  // draft already in its terminal state do not re-notify the user.
  const { data: existingDraft } = await serviceClient
    .from("draft_applications")
    .select("status")
    .eq("id", draftId)
    .eq("user_id", userId)
    .maybeSingle();
  const previousStatus = asString(existingDraft?.status);

  if (outcome === "fail") {
    // Supabase query errors resolve on `error`, they don't throw — capture and
    // surface the failure instead of swallowing it, or the draft silently
    // stays "queued" while the worker believes the sync happened.
    const { error } = await serviceClient.from("draft_applications").update({
      status: "failed",
      error_message: (errorMessage || "Worker execution failed").slice(0, 1500),
    }).eq("id", draftId).eq("user_id", userId);
    if (error) {
      console.error("[applypass-agent-queue] draft_applications fail-sync failed:", error.message);
      return;
    }
    if (previousStatus !== "failed") {
      await notifyApplyOutcome(serviceClient, taskContext, "failed", {
        errorMessage: errorMessage || "Worker execution failed",
      });
    }
    return;
  }

  const jobs = Array.isArray(asRecord(result).jobs) ? asRecord(result).jobs as unknown[] : [];
  const submitted = jobs.some((job) =>
    hasVerifiedSubmissionEvidence(asRecord(job), payload)
  );
  const firstIssue = jobs
    .map((job) => asRecord(job).error)
    .find((message) => typeof message === "string" && message.trim());

  const submittedAt = submitted ? new Date().toISOString() : null;
  const { error: draftSyncError } = await serviceClient.from("draft_applications").update({
    status: submitted ? "submitted" : "ready",
    submitted_at: submittedAt,
    error_message: submitted ? null : typeof firstIssue === "string" ? firstIssue.slice(0, 1500) : null,
  }).eq("id", draftId).eq("user_id", userId);
  if (draftSyncError) console.error("[applypass-agent-queue] draft_applications complete-sync failed:", draftSyncError.message);

  if (submitted && trackedJobId) {
    const { data: trackedJob } = await serviceClient
      .from("mc_tracked_jobs")
      .select("status")
      .eq("id", trackedJobId)
      .eq("user_id", userId)
      .maybeSingle();
    const previousTrackedStatus = asString(trackedJob?.status);
    const canMoveToApplied = previousTrackedStatus === "discovered" || previousTrackedStatus === "saved";

    if (canMoveToApplied) {
      const { data: updatedTracked, error: trackedUpdateError } = await serviceClient
        .from("mc_tracked_jobs")
        .update({
          status: "applied",
          applied_at: submittedAt,
        })
        .eq("id", trackedJobId)
        .eq("user_id", userId)
        // Do not regress a Gmail-driven interview/viewed transition that won
        // a race with this worker completion callback.
        .eq("status", previousTrackedStatus)
        .select("id")
        .maybeSingle();
      if (trackedUpdateError) {
        console.error("[applypass-agent-queue] tracked job sync failed:", trackedUpdateError.message);
      } else if (updatedTracked) {
        await serviceClient.from("mc_status_history").insert({
          tracked_job_id: trackedJobId,
          user_id: userId,
          status_from: previousTrackedStatus,
          status_to: "applied",
          source: "auto_apply",
        });
      }
    } else if (previousTrackedStatus) {
      // Preserve any later funnel status while still recording the known
      // submission timestamp.
      await serviceClient
        .from("mc_tracked_jobs")
        .update({ applied_at: submittedAt })
        .eq("id", trackedJobId)
        .eq("user_id", userId);
    }
  }

  if (submitted && !draftSyncError && previousStatus !== "submitted") {
    await notifyApplyOutcome(serviceClient, taskContext, "submitted", {
      submittedAt: submittedAt || new Date().toISOString(),
    });
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body?.action || "enqueue") as QueueAction;

    const workerActions = new Set<QueueAction>([
      "claim-next",
      "heartbeat",
      "authorization-status",
      "verification-code",
      "verification-code-result",
      "complete",
      "fail",
    ]);
    if (workerActions.has(action)) {
      if (!workerAuthorized(req, body)) {
        return jsonResponse({ error: "Unauthorized worker action." }, 401);
      }

      const serviceClient = createServiceClient();
      const rawWorkerId =
        String(body?.workerId || req.headers.get("x-worker-id") || "applypass-worker").trim() ||
        "applypass-worker";
      const workerId = rawWorkerId.replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, 120);

      if (action === "claim-next") {
        const { data, error } = await serviceClient.rpc("claim_applypass_task", {
          p_worker_id: workerId,
        });

        if (error) throw error;

        const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
        const task = rows[0] || null;
        if (task) {
          const payload = asRecord(task.payload);
          const storagePath = asString(payload.resumeStoragePath);
          const taskUserId = asString(task.user_id);
          if (!storagePath) {
            // Legacy tasks stored an expiring signed URL directly in the
            // payload. Never hand that stale capability to a worker: it can
            // fail nondeterministically and, worse, bypass the current
            // owner/path validation. The originating review flow can safely
            // regenerate an immutable artifact and enqueue a new task.
            await serviceClient.from("applypass_tasks").update({
              status: "failed",
              result: {
                submitted: false,
                code: "RESUME_ARTIFACT_REGENERATION_REQUIRED",
              },
              error_message: "The résumé artifact must be regenerated before this application can run.",
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", asString(task.id)).eq("locked_by", workerId).eq("status", "running");
            return jsonResponse({
              ok: true,
              task: null,
              rejected_task: asString(task.id),
              message: "The task résumé artifact must be regenerated.",
              code: "RESUME_ARTIFACT_REGENERATION_REQUIRED",
            });
          }
          if (!taskUserId || !storagePath.startsWith(`${taskUserId}/generated/`)) {
            await serviceClient.from("applypass_tasks").update({
              status: "failed",
              error_message: "The private résumé artifact failed validation.",
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", asString(task.id)).eq("locked_by", workerId).eq("status", "running");
            return jsonResponse({
              ok: true,
              task: null,
              rejected_task: asString(task.id),
              message: "The task résumé artifact is invalid.",
              code: "RESUME_ARTIFACT_INVALID",
            });
          }
          const { data: signed, error: signedError } = await serviceClient.storage
            .from("documents")
            .createSignedUrl(storagePath, 3600);
          if (signedError || !signed?.signedUrl) {
            const attemptsExhausted =
              Number(task.attempt_count || 0) >= Number(task.max_attempts || 3);
            await serviceClient.from("applypass_tasks").update({
              status: attemptsExhausted ? "failed" : "pending",
              locked_by: null,
              locked_at: null,
              heartbeat_at: null,
              completed_at: attemptsExhausted ? new Date().toISOString() : null,
              error_message: attemptsExhausted
                ? "The private résumé artifact could not be signed after all retries."
                : "The private résumé artifact could not be signed; the task will retry.",
              updated_at: new Date().toISOString(),
            }).eq("id", asString(task.id)).eq("locked_by", workerId).eq("status", "running");
            return jsonResponse({ error: "The task résumé artifact could not be opened." }, 503);
          }
          task.payload = { ...payload, resumeFileUrl: signed.signedUrl };
        }
        return jsonResponse({ ok: true, task });
      }

      const taskId = String(body?.taskId || "").trim();
      if (!taskId) {
        return jsonResponse({ error: "taskId is required" }, 400);
      }

      if (action === "authorization-status") {
        const { data: task } = await serviceClient
          .from("applypass_tasks")
          .select("id,user_id,status,task_type,locked_by")
          .eq("id", taskId)
          .eq("locked_by", workerId)
          .maybeSingle();
        if (!task) return jsonResponse({ ok: true, authorized: false, reason: "task_not_active" });

        const { data: prefs } = await serviceClient
          .from("user_job_prefs")
          .select("agent_enabled,auto_apply_enabled,review_mode")
          .eq("user_id", task.user_id)
          .maybeSingle();
        const continuousTask = task.task_type === "career_ops_submit";
        const authorized = task.status === "running" && (
          !continuousTask || (
            prefs?.agent_enabled === true
            && prefs?.auto_apply_enabled === true
            && prefs?.review_mode === "eligible_only"
          )
        );
        return jsonResponse({
          ok: true,
          authorized,
          reason: authorized ? "authorized" : task.status !== "running" ? "task_stopped" : "agent_stopped",
        });
      }

      if (action === "verification-code") {
        const jobId = String(body?.jobId || "").trim();
        if (!jobId) return jsonResponse({ error: "jobId is required" }, 400);

        const { data: task } = await serviceClient
          .from("applypass_tasks")
          .select("id,user_id,payload,status,locked_by")
          .eq("id", taskId)
          .eq("status", "running")
          .eq("locked_by", workerId)
          .maybeSingle();
        if (!task) return jsonResponse({ error: "Active task not found" }, 404);

        const taskPayload = asRecord(task.payload);
        const taskJobs = Array.isArray(taskPayload.jobs) ? taskPayload.jobs.map(asRecord) : [];
        const taskJob = taskJobs.find((job) => String(job.id || "") === jobId);
        if (!taskJob) return jsonResponse({ error: "Job does not belong to this task" }, 403);

        const trackedJobId = asString(taskJob.trackedJobId)
          || asString(taskJob.tracked_job_id)
          || asString(taskPayload.tracked_job_id);
        if (!trackedJobId) {
          return jsonResponse({
            ok: true,
            available: false,
            inbox_status: "JOB_INBOX_NOT_LINKED",
          });
        }
        const { data: trackedJob, error: trackedJobError } = await serviceClient
          .from("mc_tracked_jobs")
          .select("id,company,job_title,apply_url,scanned_job_id")
          .eq("id", trackedJobId)
          .eq("user_id", task.user_id)
          .is("deleted_at", null)
          .maybeSingle();
        if (trackedJobError || !trackedJob) {
          return jsonResponse({
            ok: true,
            available: false,
            inbox_status: "JOB_INBOX_NOT_LINKED",
          });
        }

        let verifiedSource: OtpVerifiedSource | null = null;
        if (trackedJob.scanned_job_id) {
          const { data: sourceRow, error: sourceError } = await serviceClient
            .from("scanned_jobs")
            .select("id,apply_url,company:scan_companies(name,api_type,api_identifier,careers_url)")
            .eq("id", trackedJob.scanned_job_id)
            .maybeSingle();
          const sourceCompany = Array.isArray(sourceRow?.company)
            ? sourceRow.company[0]
            : sourceRow?.company;
          if (!sourceError && sourceRow && sourceCompany) {
            verifiedSource = {
              scannedJobId: String(sourceRow.id || ""),
              company: String(sourceCompany.name || ""),
              provider: String(sourceCompany.api_type || ""),
              providerIdentifier: String(sourceCompany.api_identifier || ""),
              applyUrl: String(sourceRow.apply_url || ""),
              companyUrl: sourceCompany.careers_url
                ? String(sourceCompany.careers_url)
                : null,
            };
          }
        }
        const targetEvidence = {
          trackedJobId,
          company: asString(taskJob.company) || asString(taskPayload.company_name),
          jobTitle: asString(taskJob.title) || asString(taskPayload.job_title),
          applyUrl: asString(taskJob.url) || asString(taskPayload.apply_url),
          provider: asString(taskJob.portal) || asString(taskPayload.portal),
          jobId: asString(taskJob.id) || null,
          providerIdentifier:
            asString(taskJob.api_identifier) ||
            asString(taskPayload.api_identifier) ||
            null,
        };
        const exactTarget = verifyOtpJobTarget(
          trackedJob,
          targetEvidence,
          verifiedSource,
        );
        if (!exactTarget) {
          // Never lease a code using only a tracked-job UUID. The running
          // task must still match that job's verified provider, company, job
          // identity, and exact application URL.
          return jsonResponse({
            ok: true,
            available: false,
            inbox_status: "JOB_INBOX_NOT_LINKED",
          });
        }

        // Poll through the server-side Gmail connection. OAuth tokens never
        // enter the worker payload, browser context, logs, or frontend.
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const serviceRole = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        // inbox_status contract consumed by the worker/adapters: OK when a
        // code is returned; CODE_NOT_RECEIVED keeps the adapter polling;
        // JOB_INBOX_NOT_LINKED / INBOX_RECONNECT_REQUIRED / INBOX_UNAVAILABLE
        // are terminal handoff reasons.
        let inboxStatus = "CODE_NOT_RECEIVED";
        if (!supabaseUrl || !serviceRole) {
          inboxStatus = "INBOX_UNAVAILABLE";
        } else {
          const pollResponse = await fetch(`${supabaseUrl}/functions/v1/mc-gmail-poll`, {
            method: "POST",
            headers: {
              apikey: serviceRole,
              authorization: `Bearer ${serviceRole}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ user_id: task.user_id }),
          }).catch(() => null);
          if (!pollResponse) {
            inboxStatus = "INBOX_CHECK_FAILED";
          } else {
            const pollBody = await pollResponse.json().catch(() => ({}));
            const failureCodes = Array.isArray(pollBody?.failure_codes) ? pollBody.failure_codes : [];
            if (!pollResponse.ok || Number(pollBody?.failed || 0) > 0) {
              inboxStatus = String(failureCodes[0] || "INBOX_CHECK_FAILED");
            }
          }
        }

        // The Gmail poll can take several network round trips. Re-read the
        // mutable tracked row immediately before reservation so provider,
        // company, job identity, or URL drift during the poll fails closed.
        const { data: leaseTrackedJob, error: leaseTrackedJobError } =
          await serviceClient
            .from("mc_tracked_jobs")
            .select("id,company,job_title,apply_url,scanned_job_id")
            .eq("id", trackedJobId)
            .eq("user_id", task.user_id)
            .is("deleted_at", null)
            .maybeSingle();
        const leaseTarget = leaseTrackedJobError || !leaseTrackedJob
          ? null
          : verifyOtpJobTarget(
            leaseTrackedJob,
            targetEvidence,
            verifiedSource,
          );
        if (!leaseTarget) {
          return jsonResponse({
            ok: true,
            available: false,
            inbox_status: "JOB_INBOX_NOT_LINKED",
          });
        }

        const { data: codeRows, error: reserveError } = await serviceClient.rpc(
          "mc_reserve_verification_code",
          {
            p_task_id: taskId,
            p_worker_id: workerId,
            p_user_id: task.user_id,
            p_tracked_job_id: trackedJobId,
          },
        );
        if (reserveError) throw reserveError;
        const codeRow = Array.isArray(codeRows) ? codeRows[0] : null;
        if (!codeRow?.code_ciphertext || !codeRow?.reservation_id) {
          return jsonResponse({ ok: true, available: false, inbox_status: inboxStatus });
        }
        const { data: codeEmail, error: codeEmailError } = await serviceClient
          .from("mc_inbound_emails")
          .select("id,from_email,tracked_job_id")
          .eq("id", codeRow.email_id)
          .eq("user_id", task.user_id)
          .eq("tracked_job_id", trackedJobId)
          .maybeSingle();
        if (
          codeEmailError ||
          !codeEmail ||
          !senderDomainBoundToOtpTarget(String(codeEmail.from_email || ""), leaseTarget)
        ) {
          // The private store only receives authenticated senders, and the
          // lease re-binds its public provenance to the task's current exact
          // target. Discard a stale or inconsistent row rather than releasing
          // it for repeated reservation attempts.
          await serviceClient.rpc("mc_ack_verification_code", {
            p_reservation_id: codeRow.reservation_id,
            p_task_id: taskId,
            p_worker_id: workerId,
            p_accepted: true,
          });
          return jsonResponse({
            ok: true,
            available: false,
            inbox_status: "JOB_INBOX_NOT_LINKED",
          });
        }

        const encryptionKey = Deno.env.get("GMAIL_TOKEN_ENCRYPTION_KEY") || "";
        if (!encryptionKey) {
          await serviceClient.rpc("mc_ack_verification_code", {
            p_reservation_id: codeRow.reservation_id,
            p_task_id: taskId,
            p_worker_id: workerId,
            p_accepted: false,
          });
          return jsonResponse({ ok: true, available: false, inbox_status: "INBOX_UNAVAILABLE" });
        }
        try {
          const code = await decryptSecret(codeRow.code_ciphertext, encryptionKey);
          return jsonResponse({
            ok: true,
            available: true,
            code,
            reservation_id: codeRow.reservation_id,
            inbox_status: "OK",
          });
        } catch (error) {
          console.error("[applypass-agent-queue] verification decrypt failed", error);
          await serviceClient.rpc("mc_ack_verification_code", {
            p_reservation_id: codeRow.reservation_id,
            p_task_id: taskId,
            p_worker_id: workerId,
            p_accepted: false,
          });
          return jsonResponse({ ok: true, available: false, inbox_status: "INBOX_UNAVAILABLE" });
        }
      }

      if (action === "verification-code-result") {
        const reservationId = asString(body?.reservationId);
        if (!reservationId || typeof body?.accepted !== "boolean") {
          return jsonResponse({ error: "reservationId and accepted are required" }, 400);
        }
        const { data: acknowledged, error } = await serviceClient.rpc(
          "mc_ack_verification_code",
          {
            p_reservation_id: reservationId,
            p_task_id: taskId,
            p_worker_id: workerId,
            p_accepted: body.accepted,
          },
        );
        if (error) throw error;
        if (acknowledged !== true) {
          return jsonResponse({ error: "The verification-code lease is no longer active." }, 409);
        }
        return jsonResponse({ ok: true, acknowledged: true });
      }

      if (action === "heartbeat") {
        const { data, error } = await serviceClient
          .from("applypass_tasks")
          .update({ heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", taskId)
          .eq("status", "running")
          .eq("locked_by", workerId)
          .select("id,user_id,status,heartbeat_at,updated_at")
          .single();

        if (error) throw error;

        if (body?.log) {
          await serviceClient.rpc("append_applypass_task_log", {
            p_task_id: taskId,
            p_entry: body.log,
          });
        }

        await serviceClient.from("mc_worker_heartbeats").upsert({
          user_id: data.user_id,
          hostname: workerId,
          version: "applypass-browser-worker-v2",
          last_seen: new Date().toISOString(),
        }, { onConflict: "user_id" });

        return jsonResponse({ ok: true, task: data });
      }

      if (action === "complete") {
        const { data: taskContext } = await serviceClient
          .from("applypass_tasks")
          .select("task_type,payload,user_id")
          .eq("id", taskId)
          .eq("status", "running")
          .eq("locked_by", workerId)
          .maybeSingle();
        if (!taskContext) {
          return jsonResponse({ error: "The task lease is no longer active." }, 409);
        }
        await recordSubmissionReceipts(
          serviceClient,
          taskId,
          workerId,
          taskContext as Record<string, unknown>,
          body?.result,
        );
        const { data, error } = await serviceClient
          .from("applypass_tasks")
          .update({
            status: "completed",
            result: body?.result || null,
            error_message: null,
            heartbeat_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", taskId)
          .eq("status", "running")
          .eq("locked_by", workerId)
          .select("id,status,completed_at,updated_at")
          .single();

        if (error) throw error;

        if (body?.log) {
          await serviceClient.rpc("append_applypass_task_log", {
            p_task_id: taskId,
            p_entry: body.log,
          });
        }

        await syncCareerDraft(serviceClient, taskContext, "complete", body?.result);

        return jsonResponse({ ok: true, task: data });
      }

      if (action === "fail") {
        const errorMessage = String(body?.errorMessage || "Worker execution failed").slice(0, 1500);
        const { data: taskContext } = await serviceClient
          .from("applypass_tasks")
          .select("task_type,payload,user_id")
          .eq("id", taskId)
          .eq("status", "running")
          .eq("locked_by", workerId)
          .maybeSingle();
        if (!taskContext) {
          return jsonResponse({ error: "The task lease is no longer active." }, 409);
        }

        const { data, error } = await serviceClient
          .from("applypass_tasks")
          .update({
            status: "failed",
            result: body?.result || null,
            error_message: errorMessage,
            heartbeat_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", taskId)
          .eq("status", "running")
          .eq("locked_by", workerId)
          .select("id,status,error_message,completed_at,updated_at")
          .single();

        if (error) throw error;

        if (body?.log) {
          await serviceClient.rpc("append_applypass_task_log", {
            p_task_id: taskId,
            p_entry: body.log,
          });
        }

        await syncCareerDraft(serviceClient, taskContext, "fail", body?.result, errorMessage);

        return jsonResponse({ ok: true, task: data });
      }

      return jsonResponse({ error: "Unsupported worker action" }, 400);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: "Supabase env vars missing" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (action === "list") {
      const { data, error } = await supabase
        .from("applypass_tasks")
        .select("id,task_type,status,error_message,created_at,updated_at,payload,result,run_log,attempt_count,max_attempts,started_at,completed_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      return jsonResponse({ ok: true, tasks: data || [] });
    }

    if (action === "cancel") {
      const taskId = String(body?.taskId || "").trim();
      if (!taskId) {
        return jsonResponse({ error: "taskId is required" }, 400);
      }

      const serviceClient = createServiceClient();
      const { data, error } = await serviceClient
        .from("applypass_tasks")
        .update({ status: "canceled", updated_at: new Date().toISOString() })
        .eq("id", taskId)
        .eq("user_id", user.id)
        .in("status", ["pending", "running"])
        .select("id,status,updated_at")
        .single();

      if (error) throw error;

      return jsonResponse({ ok: true, task: data });
    }

    const jobs = Array.isArray(body?.jobs) ? body.jobs : [];
    if (jobs.length === 0) {
      return jsonResponse({ error: "jobs array is required" }, 400);
    }

    if (jobs.length > 25) {
      return jsonResponse({ error: "Maximum 25 jobs per queued task" }, 400);
    }

    const serviceClient = createServiceClient();
    await enforceAutoApplyEntitlement(serviceClient, user.id);
    await enforceMonthlyAutoApplyExecutionCap(serviceClient, user.id, jobs.length);

    const approvedAt = new Date().toISOString();
    const trustedJobs = jobs.map((rawJob, index) => {
      const job = asRecord(rawJob);
      const target = classifyAtsApplyUrl(job.url);
      const title = asString(job.title).slice(0, 240);
      const company = asString(job.company).slice(0, 180);
      if (!target.supported || !title || !company) {
        const error = new Error(`Job ${index + 1} is not available for secure automatic submission.`);
        (error as { status?: number }).status = 422;
        throw error;
      }
      return {
        id: asString(job.id).slice(0, 160) || crypto.randomUUID(),
        title,
        company,
        location: asString(job.location).slice(0, 180) || null,
        url: target.normalizedUrl,
        description: asString(job.description).slice(0, 24_000) || null,
        portal: target.type,
        approvalReceipt: {
          approved: true,
          reviewedAt: approvedAt,
          source: "user_queue_action",
        },
      };
    });

    const resumeId = asString(body?.resumeId);
    if (!resumeId) {
      const error = new Error("Choose a reviewed résumé before starting automatic applications.");
      (error as { status?: number }).status = 412;
      throw error;
    }
    const { data: sourceResume } = await serviceClient
      .from("resumes")
      .select("id,parse_quality,source_hash,source_document_id,parser_version,parsed_at")
      .eq("id", resumeId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!sourceResume) {
      const error = new Error("The selected résumé is not available.");
      (error as { status?: number }).status = 404;
      throw error;
    }
    if (!getResumeReviewState(sourceResume).allowed) {
      const error = new Error(RESUME_REVIEW_REQUIRED_MESSAGE);
      (error as { status?: number }).status = 412;
      throw error;
    }

    const renderSupabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRole = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const renderResponse = await fetch(`${renderSupabaseUrl}/functions/v1/mc-render-resume`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ resume_id: resumeId, format: "pdf", user_id: user.id }),
    });
    const rendered = await renderResponse.json().catch(() => ({}));
    if (!renderResponse.ok || typeof rendered?.url !== "string" || !rendered.url) {
      const error = new Error("The reviewed résumé PDF could not be prepared.");
      (error as { status?: number }).status = 412;
      throw error;
    }

    const taskPayload = {
      jobs: trustedJobs,
      resumeId,
      resumeStoragePath: asString(rendered.storage_path),
      candidateProfile: body?.candidateProfile || null,
      answerMemory: body?.answerMemory || null,
      source: "applypass_workspace",
      createdBy: user.email || user.id,
      createdAt: approvedAt,
    };
    if (!taskPayload.resumeStoragePath.startsWith(`${user.id}/generated/`)) {
      const error = new Error("The reviewed résumé artifact was not stored correctly.");
      (error as { status?: number }).status = 500;
      throw error;
    }

    const { data, error } = await serviceClient
      .from("applypass_tasks")
      .insert({
        user_id: user.id,
        task_type: "bulk_apply",
        status: "pending",
        payload: taskPayload,
      })
      .select("id,task_type,status,created_at")
      .single();

    if (error) throw error;

    return jsonResponse({ ok: true, task: data });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error
      ? Number((error as { status?: number }).status) || 500
      : 500;
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, status);
  }
});
